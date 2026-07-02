# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Required for every build/test invocation** — Command Line Tools alone doesn't ship the `Testing` framework or XCTest for macOS, so point SPM at the full Xcode toolchain:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

Without this, `swift test` fails with `no such module 'Testing'`.

| Task | Command |
|---|---|
| Build everything | `swift build` |
| Build only Core | `swift build --target TeleprompterCore` |
| Run all 42 unit tests | `swift test` |
| Run one suite | `swift test --filter ReadingTracker` |
| Run one test | `swift test --filter ReadingTracker/skipForward` |
| Launch from CLI | `swift run TeleprompterApp` |
| Package a proper `.app` bundle (ad-hoc signed) | `bash scripts/build-app.sh [release\|debug]` → produces `OpenTeleprompter.app` at repo root |
| Run the packaged app | `open OpenTeleprompter.app` |

For real permission flows (mic, speech recognition, system audio capture), use the `.app` bundle — raw SPM executables have unstable TCC identity, so permission prompts may never appear or get forgotten on restart.

## Architecture

### Two-target split

**`TeleprompterCore`** (pure Swift library, fully covered by tests) owns all the logic that doesn't depend on AppKit/SwiftUI. Never `import AppKit` or `import SwiftUI` in Core — App is allowed to depend on Core, never the reverse.

**`TeleprompterApp`** (SwiftUI + AppKit executable) is the shell: `NSPanel` floating at the notch, menu bar item, coordinators that wire Core modules together.

### State machine is the backbone

`IslandState` (Core) is the single source of truth for what's on screen: `.hidden / .compact / .expanded / .listening(String) / .thinking / .teleprompter(payload) / .error(msg)`. The `String` on `.listening` is the live ASR partial transcript, displayed to the right of the waveform indicator. `AppState` (App) publishes it via Combine. Two observers react:

1. `IslandWindowController` resizes the `NSPanel` frame via `NSAnimationContext` on every state change — sizes come from `NotchGeometry.frame(for:lines:quizMode:layout:)`. It also observes `state.$quizAnswer` separately, because quiz mode toggles the panel size while `islandState` stays as `.teleprompter`.
2. `IslandRootView` (SwiftUI) renders different content per state with a `.animation(.spring, value: state.islandState)` transition. The `.teleprompter` case has an internal branch: when `state.quizAnswer != nil`, it renders `QuizAnswerView` (large answer + small reasoning) instead of the normal scrolling `TeleprompterView`.

Adding a new state means updating all three: the enum, `NotchGeometry.size(for:)`, and `IslandRootView.content`. Extending an existing state's payload (e.g. `.listening("...")` carrying live transcript) is a lighter alternative — the enum's `Equatable` derives correctly, and the existing `removeDuplicates()` on `state.$islandState` re-fires on every distinct value.

### Coordinators glue Core to UI

`MeetingSessionCoordinator`, `InterviewSessionCoordinator`, and `QuizSessionCoordinator` are the only places that compose Speech + Matching + LLM together (the first two) or Screenshot + vision LLM (the third). They own the `ReadingTracker`, `SpeechRecognizer`, `MicAudioTap` / `SystemAudioTap`, `VAD`, `AutoHideTimer`, and `LLMClient` lifecycles. The App delegate instantiates one per "start" invocation and tears it down on "stop". The three are mutually exclusive: `AppDelegate.startCurrent()` always calls `stopCurrent()` first, which kills whichever coordinator is alive.

The interview flow has four phases (documented in the header of `InterviewSessionCoordinator.swift`): listening → thinking → teleprompter → back to listening. Audio sources swap between system audio (for question capture) and mic (for user reading) — they must never run simultaneously or the SFSpeech session gets confused.

The quiz flow is one-shot: capture → thinking → teleprompter (with `state.quizAnswer` set) → autoHide back to compact. Triggered by hotkey (`⌃⌥Q` default, configurable in Settings) or by selecting 笔试模式 in the menu and clicking 开始. See "Quiz mode" section below.

### Coordinator lifecycle: always stop before starting, isStopped guards every await

`AppDelegate.startCurrent`, `selectMeetingMode`, `selectInterviewMode`, and `selectQuizMode` all call `stopCurrent()` before doing anything else. Skipping that orphans the previous coordinator with its mic engine, CATap, and SFSpeech tasks still running — the variable gets reassigned but the audio keeps flowing.

Inside `InterviewSessionCoordinator` and `QuizSessionCoordinator`, an `isStopped` flag is checked at every async boundary (after each `await`). Once `stop()` flips it, in-flight `startListening` / `callLLM` / `startReadingTracking` / `run` short-circuit instead of writing state or starting new audio. The outer `readingSetupTask` in InterviewSessionCoordinator is also tracked separately so it can be cancelled. Don't remove these "for cleanup" — the coordinators orchestrate many concurrent tasks and the flag is the only cheap way to make them all bail safely after `stop()` returns.

### System audio capture uses Core Audio Process Tap, not ScreenCaptureKit

`SystemAudioTap` (Core/Speech, macOS 14.4+) builds a `CATapDescription` with `AudioHardwareCreateProcessTap`, wraps it in a private aggregate device, and pulls audio via `AudioDeviceCreateIOProcIDWithBlock`. The tap output (typically 48 kHz stereo interleaved) is fed through an `AVAudioConverter` and downsampled to 16 kHz mono Float32 non-interleaved before reaching `SFSpeechRecognizer` — feeding raw 48 kHz stereo to SFSpeech yields silence-equivalent: no recognition.

This is deliberate. The earlier `SCStream` / `SCShareableContent` implementation needed `kTCCServiceScreenCapture`, which TCC keys on cdhash for ad-hoc signed apps. Every rebuild produces a new cdhash, so the user had to re-grant Screen Recording in System Settings on every iteration — and on macOS 15+ the OS no longer offers an in-dialog "Allow" for screen recording, forcing a trip to System Settings each time. CATap only triggers `kTCCServiceAudioCapture`, which sticks across rebuilds in practice.

The IOProc closure is set up with **value-captured constants** (source/target formats, converter, handler), not `[weak self]`. `AudioDeviceCreateIOProcIDWithBlock` takes an Obj-C `@convention(block)` closure; Swift weak references across that boundary go nil silently, and the IOProc never fires.

**Process-level vs global tap.** The implementation enumerates all current process audio objects (`kAudioHardwarePropertyProcessObjectList`) and passes them via `CATapDescription(stereoMixdownOfProcesses:)`. The cleaner-sounding `stereoGlobalTapButExcludeProcesses: []` is *supposed* to capture everything but on macOS 26 produces no buffers — verified by the IOProc not firing. The cost of process-level enumeration is that processes started **after** the tap starts aren't captured (e.g. running `say` in Terminal after clicking 开始 won't be recognized). For real use this is a non-issue: the user joins a meeting / opens the video first, then starts the teleprompter, so the target process is in the snapshot.

Don't refactor back to `SCShareableContent` / `SCStream` for audio capture without reading this — the development loop will break for everyone, and "permission keeps prompting" reports will start coming in.

### Quiz mode: screenshot via `screencapture` cli, not ScreenCaptureKit

Quiz answers (`QuizSessionCoordinator`) shell out to `/usr/sbin/screencapture` (`Sources/TeleprompterApp/Util/ScreenCapture.swift`) instead of using ScreenCaptureKit. The system tool has its own TCC entry, so our ad-hoc-signed app doesn't need `kTCCServiceScreenCapture` at all — same rationale as the audio path. `-i -c` does interactive region select, `-c -x` does silent full-screen, both land in `NSPasteboard`. We read PNG (or convert TIFF→PNG via `NSBitmapImageRep`), base64-encode it, and feed `LLMClient.streamVision(userPrompt:imageData:)`.

`streamVision` adds OpenAI's multimodal `content` array (text + `image_url: { url: "data:image/png;base64,..." }`) and `response_format: { type: "json_object" }` to the request body. Most modern OpenAI-compatible providers (OpenAI, DeepSeek, Moonshot, OpenRouter) honor it; Ollama / SiliconFlow ignore it but the system prompt asks for JSON anyway, so the LLM still complies. The non-vision `stream(userPrompt:)` API is unchanged — both share the same `runStream` private method via `imageData: Data?` + `jsonResponse: Bool` parameters.

`QuizSessionCoordinator.parsePayload` tolerates ```json fenced wrapping; some providers ignore the format hint and add markdown anyway. The expected JSON shape is `{kind: "choice"|"fill"|"coding", answer, language?, reasoning}`.

**Coding-question answers never reach the island as visible text.** The coordinator extracts the code from `answer`, writes it to `NSPasteboard.general`, sets `QuizAnswerPayload.codeCopied = true` and clears `answer`. The user pastes into their IDE — the island only shows "✓ 已复制" + the reasoning text. Don't show code in the pill, the line widths are wrong for it. The `quizMode: Bool` parameter on `NotchGeometry.size` stretches the panel to `680×(notchHeight+110)` for quiz answers vs the standard teleprompter sizing.

### LLMClient: provider presets and OpenAI-compat assumption

All seven `LLMProvider` cases (OpenAI / DeepSeek / Moonshot / SiliconFlow / OpenRouter / Ollama / Custom) speak OpenAI's `/v1/chat/completions` SSE protocol. The provider preset is purely UI sugar in `SettingsView` — picking a provider auto-fills `baseURL` and `model`, then the request goes through the same `LLMClient.runStream`. `LLMConfig.chatCompletionsURL` handles `/v1` deduping for proxies that put it in `baseURL`.

If you add an Anthropic-native or Gemini-native provider in the future, that's a real protocol fork: different auth header (`x-api-key` for Anthropic), different request shape (`/v1/messages`), different SSE event types. Keep that as a separate code path, not a `runStream` flag explosion.

### ReadingTracker: why the delta matters

ASR transcripts from `SFSpeechRecognizer` are **cumulative** (each partial contains everything said so far), not incremental. The tracker tracks `lastObservedTokenCount` so it can compute `deltaCount = observedTokens.count - lastObservedTokenCount` on each `ingest()`. This delta is what distinguishes "user just read through 7 tokens in a single update" (all `.matched`) from "user jumped past 7 tokens by saying 2" (5 `.skipped` + 2 `.matched`).

If you break that invariant — e.g., by calling `reset()` without clearing `lastObservedTokenCount`, or by feeding non-cumulative transcripts — skip detection breaks silently. The unit tests in `ReadingTrackerTests` cover this path; run them after any tracker change.

### LLMClient streaming: don't use `bytes.lines`

The OpenAI-compatible SSE stream is read byte-by-byte in `LLMClient.runStream`, not via `URLSession.AsyncBytes.lines`. Early iterations used `.lines` and the mock-URL-protocol tests would only deliver one SSE event out of three (Foundation's line iterator appears to buffer the whole response when the mock writes everything before closing the stream). Byte-level accumulation with `\n\n` / `\r\n\r\n` framing is what makes `streamsDeltasFromMockResponse` pass.

### Tests use Swift Testing, not XCTest

All tests are `@Test` / `#expect` style (Swift Testing framework). There's no XCTest dependency. Any parallel-unsafe suites (e.g., anything touching `MockSSEURLProtocol.handler`, which is static) must be annotated `@Suite(..., .serialized)` or they'll interfere with each other.

## macOS-specific gotchas

**Accessory app with no Dock icon** — `LSUIElement=true` in `App-Info.plist` and `NSApp.setActivationPolicy(.accessory)` in `AppDelegate`. The only visible surfaces are the menu bar status item (speech-bubble icon) and the notch panel. Do NOT assume there's a main window — `NSApp.mainWindow` is nil.

**Settings window uses AppKit, not SwiftUI's `Settings` scene** — accessory apps don't reliably receive `showSettingsWindow:` actions because they lack a standard main menu. `SettingsWindowController` creates a plain `NSWindow` + `NSHostingView(SettingsView)` and activates the app before `makeKeyAndOrderFront`. Don't regress to `Settings { ... }` scene or the settings menu item stops working.

**Info.plist is embedded via linker flag**, not resources — SPM rejects `Info.plist` as a top-level resource. `Package.swift` uses `unsafeFlags(["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist", "-Xlinker", "App-Info.plist"])` to inject it into the Mach-O. If you add usage-description keys (e.g., for a new permission), edit `App-Info.plist` at the repo root, not anywhere under `Sources/`.

**Notch detection** — `NotchGeometry.currentScreen()` picks the first `NSScreen` whose `safeAreaInsets.top > NSStatusBar.system.thickness + 0.5`. This correctly selects the built-in display when external monitors are attached. Never use `NSScreen.main` directly for positioning — it can be the external display.

**Never draw content above `notchHeight`** — the physical notch cuts off pixels there. `IslandRootView` pads content by `layout.notchHeight + 2` from the top. If you put content above that, it's invisible on notch MacBooks.

**Pill corner radius is dynamic** — `IslandRootView` uses `GeometryReader` + `min(height * 0.5, 44)` on an `UnevenRoundedRectangle` (bottom corners only; top is flush with screen edge). Short pills get proportionally rounder, tall pills cap at 44 to avoid over-rounding the 3-line teleprompter state.

**`NSHostingView` layer must be clear** — without `hosting.wantsLayer = true; hosting.layer?.backgroundColor = .clear`, a faint dark halo appears around the pill's rounded corners. Don't re-add `.shadow(...)` to the pill — same effect.

## Adding a preference

1. `Preferences` (Core/Storage): add the key constant + computed property (UserDefaults-backed) with a sensible default.
2. `PreferencesViewModel` (App/AppState): add the field.
3. `AppState.loadPreferences` / `savePreferences`: read / write the new field.
4. `SettingsView`: add a control in the appropriate `SettingsSection` case.
5. If the pref affects window layout (like `teleprompterLines`), also thread it through `NotchGeometry.size(for:lines:layout:)` and observe it in `IslandWindowController` (see the `preferences.teleprompterLines` sink for the pattern).
