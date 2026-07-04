# OpenTeleprompter

灵动岛 / 药丸式实时提词器。朗读时浮窗跟随高亮，跳读鲁棒；面试时捕获对方提问自动生成回答；笔试时截图交给大模型作答。

两套独立实现，共用同一套匹配 / LLM 逻辑与交互设计：

- **macOS**：原生应用，Swift 6 + SwiftUI/AppKit，语音走本地 `SFSpeechRecognizer`。
- **Windows**：Electron 33 + TypeScript，语音走 OpenAI 兼容的云端转写接口。

## 功能

- **会议模式**：粘贴提词稿，朗读时浮窗展开跟随，已念部分变浅，跳读 / 回读都能对齐。
- **面试模式**：捕获系统音频里对方的提问，VAD 判定说完（或快捷键手动触发）后调用 LLM 生成回答，回答作为提词稿供你朗读。可上传简历，AI 会参考简历内容作答。
- **笔试模式**：一键截屏（全屏或拖框选区）交给视觉 LLM，返回选择 / 填空 / 编程题答案。编程题代码直接写入剪贴板，浮窗只显示"已复制"+ 解析。
- 浮窗连续无语音时自动收起。
- **防录屏**：浮窗对屏幕捕获隐形（共享屏幕 / 录屏 / 截图工具都看不到），你自己的屏幕正常可见。默认开启。

## 平台实现差异

| 能力 | macOS | Windows |
|---|---|---|
| 语音识别 | 本地 `SFSpeechRecognizer`，实时流式 | 云端 `/v1/audio/transcriptions`（Whisper 兼容），伪流式，约 2.5s 节拍延迟 |
| 系统音频捕获 | Core Audio Process Tap（`kTCCServiceAudioCapture`） | Electron `desktopCapturer` + WASAPI loopback |
| 麦克风 | `AVAudioEngine` | Web Audio `getUserMedia` |
| 笔试截图 | `screencapture` CLI | Electron `desktopCapturer` + 自绘选区窗 |
| 防录屏 | `NSWindow.sharingType = .none` | `setContentProtection` → `WDA_EXCLUDEFROMCAPTURE` |
| API Key 存储 | Keychain | `electron-store`（明文本地文件） |

> Windows 版需要一个支持 OpenAI `/v1/audio/transcriptions` 的转写服务（OpenAI 官方、SiliconFlow SenseVoice 等）才能识别语音；macOS 版本地识别，无需联网转写。

---

## macOS

### 要求

- macOS 14+（面试模式的系统音频捕获需要 14.4+）
- Xcode 16+（`swift test` 依赖 Swift Testing framework，需完整 Xcode 而非仅 Command Line Tools）

### 在 Xcode 里运行

```bash
open Package.swift   # 在 Xcode 里点 Run
```

首次运行会申请麦克风、语音识别权限。笔试截图走系统 `screencapture`，由它自己触发截图权限，应用本身不需要屏幕录制权限。

### 命令行

```bash
# 确保使用 Xcode 的工具链（Command Line Tools 不含 Testing framework）
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

swift build                        # 构建
swift test                         # 跑全部单元测试（Core 层 42 个用例）
swift run TeleprompterApp          # 直接运行

bash scripts/build-app.sh release  # 打包 ad-hoc 签名的 OpenTeleprompter.app
```

> 真机权限流（麦克风、系统音频）建议用 `.app` bundle，裸 SPM 可执行文件的 TCC 身份不稳定，权限框可能不弹或重启后失效。

### 全局快捷键

- `⌘⌥ Space`：面试模式手动触发"提问结束"，立即调用 LLM
- `⌘⇧ T`：显隐浮窗
- `⌃⌥ Q`：笔试截图答题（可在设置中改预设）

---

## Windows

### 要求

- Windows 10 版本 2004（build 19041）及以上——防录屏功能依赖 `WDA_EXCLUDEFROMCAPTURE`，低版本会退化为黑块
- Node.js 18+（仅开发构建需要；Electron 运行时自带）

### 构建与运行

```bash
cd windows
npm install
npm run build      # tsc 编译到 dist/
npm start          # 构建并启动
```

应用是托盘程序，没有主窗口——启动后在系统托盘找那个圆点图标，右键菜单里开始 / 停止 / 切换模式 / 打开设置。

### 打包

```bash
npm run dist       # electron-builder 产出 NSIS 安装包到 release/
```

### 全局快捷键

- `Ctrl + Alt + Space`：面试模式手动触发"提问结束"
- `Ctrl + Shift + T`：显隐浮窗
- `Ctrl + Alt + Q`：笔试截图答题（任何模式下按都会切到笔试并截图）

---

## 设置

从托盘图标（Windows）或菜单栏图标（macOS）打开设置：

- **LLM**：baseURL（如 `https://api.openai.com`）+ API Key + model（如 `gpt-4o-mini`）+ 系统 prompt + maxTokens + 温度
- **语音识别**：中文普通话 / 英文切换。Windows 额外可配识别模型 / baseURL / API Key（留空则复用 LLM 配置）
- **提词器**：无语音自动收起时长、显示行数、是否防录屏
- **会议稿件**：会议模式朗读文本
- **个人简历**：上传 PDF（Windows 自动提取文本），面试模式注入 system prompt
- **笔试助手**：截图模式（全屏 / 交互选区）+ 笔试专用 prompt

---

## 架构

### macOS

```
TeleprompterApp (SwiftUI + AppKit 壳)
  ├── Window: NotchPanel / NotchGeometry / IslandWindowController
  ├── Views:  IslandRootView + Compact/Listening/Thinking/Teleprompter/Quiz/Settings
  ├── Coordinators: Meeting / Interview / Quiz
  ├── Hotkeys: Carbon RegisterEventHotKey
  └── 依赖 ↓

TeleprompterCore (纯 Swift 库，全部可测)
  ├── Speech:   SpeechRecognizer (SFSpeech) / MicAudioTap (AVAudioEngine)
  │             / SystemAudioTap (Core Audio Process Tap) / VAD
  ├── Matching: TokenNormalizer / FuzzyMatcher / ReadingTracker
  ├── LLM:      LLMConfig / LLMClient (OpenAI /v1/chat/completions 流式) / SSEStreamParser
  ├── State:    IslandState / SessionMode / TeleprompterPayload / QuizAnswerPayload
  └── Storage:  Preferences (UserDefaults) / KeychainStore (API Key)
```

### Windows（`windows/`）

```
main (Electron 主进程)
  ├── windows/: PillWindow / SettingsWindow / RegionPicker（自绘选区）
  ├── audio/:   AudioCaptureService（隐藏渲染窗，mic + loopback）
  ├── speech/:  SpeechRecognizer（分块伪流式 ASR）/ VAD
  ├── coordinators/: meeting / interview / quiz
  ├── matching/: token-normalizer / fuzzy-matcher / reading-tracker
  ├── llm/:     client（流式 + 视觉 + 中止）/ config / sse-parser
  ├── tray / hotkeys / ipc-handlers / storage(electron-store) / resume(pdfjs)
  └── shared/types.ts（状态机 / IPC 契约 / 偏好，主进程与渲染进程共用）

renderer (渲染进程)
  ├── pill/:     浮窗 UI（各状态渲染）
  ├── settings/: 设置面板
  ├── capture/:  隐藏音频采集页（Web Audio → PCM）
  └── region/:   笔试交互选区画布
```

> 两个平台的匹配层（TokenNormalizer / FuzzyMatcher / ReadingTracker）与 SSE / LLM 逻辑是逐行对齐的同一套算法，Windows 版是 macOS Core 的 TypeScript 移植。

## 核心算法：ReadingTracker

跳读鲁棒的朗读追踪器。关键设计：

1. 用 `lastObservedTokenCount` 跟踪 ASR 累积文本，每次 ingest 计算增量 `deltaCount`
2. 把最近 `max(tailLength, deltaCount+2)` 个 token 作为指纹
3. 在 `[cursor - searchBack, cursor + searchAhead)` 窗口内用编辑距离做滑动匹配
4. 置信度 ≥ `confidenceThreshold` 才更新 cursor
5. matched 长度 = `min(gap, deltaCount)`，其余标为 `.skipped`（用户真的跳过了）
6. 允许回读：cursor 后退时把撤销区间恢复为 `.unread`

## 测试

```bash
# macOS，需 Xcode 工具链
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
swift test   # 42 个用例覆盖 TokenNormalizer、FuzzyMatcher、ReadingTracker、LLM、SSE
```

Windows 版目前以 `tsc` 类型检查 + 启动冒烟为主，尚无单元测试。

## 不在当前版本范围

- macOS 签名 / 公证 / DMG 打包、Sparkle 自动更新
- Windows 版真流式本地识别（当前为云端伪流式，约 2.5s 延迟）
- 多稿件管理
- Anthropic / Gemini 原生协议（已可走 OpenAI 兼容代理）
