import SwiftUI
import TeleprompterCore

struct SettingsView: View {
    @EnvironmentObject var state: AppState
    @State private var selection: SettingsSection = .llm

    var body: some View {
        NavigationSplitView {
            List(SettingsSection.allCases, selection: $selection) { section in
                Label(section.title, systemImage: section.icon).tag(section)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 220)
            .listStyle(.sidebar)
        } detail: {
            detailView
                .navigationTitle(selection.title)
        }
        .navigationSplitViewStyle(.balanced)
        .frame(minWidth: 720, minHeight: 520)
        .onDisappear { state.savePreferences() }
    }

    @ViewBuilder
    private var detailView: some View {
        switch selection {
        case .llm:    LLMSection()
        case .speech: SpeechSection()
        case .script: ScriptSection()
        case .resume: ResumeSection()
        case .quiz:   QuizSection()
        case .island: IslandSection()
        case .about:  AboutSection()
        }
    }
}

enum SettingsSection: String, CaseIterable, Identifiable, Hashable {
    case llm, speech, script, resume, quiz, island, about
    var id: String { rawValue }

    var title: String {
        switch self {
        case .llm: return "LLM"
        case .speech: return "语音识别"
        case .script: return "会议稿件"
        case .resume: return "个人简历"
        case .quiz: return "笔试助手"
        case .island: return "灵动岛"
        case .about: return "关于"
        }
    }

    var icon: String {
        switch self {
        case .llm: return "sparkles"
        case .speech: return "waveform"
        case .script: return "doc.text"
        case .resume: return "person.text.rectangle"
        case .quiz: return "viewfinder"
        case .island: return "rectangle.topthird.inset.filled"
        case .about: return "info.circle"
        }
    }
}

// MARK: - LLM

private struct LLMSection: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Form {
            Section {
                LabeledContent("服务商") {
                    Picker("", selection: $state.preferences.provider) {
                        ForEach(LLMProvider.allCases, id: \.self) { p in
                            Text(p.displayName).tag(p)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .frame(maxWidth: 240, alignment: .leading)
                    .onChange(of: state.preferences.provider) { _, newValue in
                        guard newValue != .custom else { return }
                        state.preferences.baseURL = newValue.defaultBaseURL
                        state.preferences.model = newValue.defaultModel
                    }
                }
                TextField(
                    "Base URL",
                    text: $state.preferences.baseURL,
                    prompt: Text("https://api.openai.com")
                )
                .textFieldStyle(.roundedBorder)
                SecureField(
                    "API Key",
                    text: $state.preferences.apiKey,
                    prompt: Text("sk-…")
                )
                .textFieldStyle(.roundedBorder)
                TextField(
                    "Model",
                    text: $state.preferences.model,
                    prompt: Text("gpt-4o-mini")
                )
                .textFieldStyle(.roundedBorder)
            } header: {
                Text("连接")
            } footer: {
                Text("选「服务商」会自动填好 Base URL 和 Model；选「自定义」可全手填。除 Ollama 是本地外，其它都走 OpenAI 兼容协议。API Key 安全存储在 Keychain。")
                    .foregroundStyle(.secondary)
            }

            Section("生成参数") {
                LabeledContent("Max tokens") {
                    Stepper(value: $state.preferences.maxTokens, in: 50...4000, step: 50) {
                        Text("\(state.preferences.maxTokens)")
                            .font(.system(.body, design: .monospaced))
                            .frame(minWidth: 56, alignment: .trailing)
                    }
                }
                LabeledContent("Temperature") {
                    HStack(spacing: 12) {
                        Slider(value: $state.preferences.temperature, in: 0...1, step: 0.1)
                            .frame(maxWidth: 240)
                        Text(String(format: "%.1f", state.preferences.temperature))
                            .font(.system(.body, design: .monospaced))
                            .frame(width: 32, alignment: .trailing)
                    }
                }
            }

            Section("系统 Prompt") {
                TextEditor(text: $state.preferences.systemPrompt)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 110)
                    .scrollContentBackground(.hidden)
                    .padding(6)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Color(nsColor: .textBackgroundColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(Color.secondary.opacity(0.2))
                    )
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Quiz

private struct QuizSection: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Form {
            Section {
                LabeledContent("快捷键") {
                    Picker("", selection: $state.preferences.quizHotkeyPreset) {
                        ForEach(QuizHotkeyPreset.allCases, id: \.self) { preset in
                            Text(preset.displayName).tag(preset)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .frame(maxWidth: 200, alignment: .leading)
                }
                LabeledContent("截屏方式") {
                    Picker("", selection: $state.preferences.screenshotMode) {
                        Text("交互式选区").tag(ScreenCaptureMode.interactive)
                        Text("全屏").tag(ScreenCaptureMode.fullScreen)
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 280)
                }
            } header: {
                Text("行为")
            } footer: {
                Text("按下快捷键 → 截屏 → 多模态 LLM 识别题目并给答案。选择题/填空题在灵动岛显示，编程题代码自动复制到剪贴板，灵动岛只显示思路概要。截屏走系统 `screencapture` 工具，不需要本 App 的屏幕录制权限。")
                    .foregroundStyle(.secondary)
            }

            Section("笔试系统 Prompt") {
                TextEditor(text: $state.preferences.quizSystemPrompt)
                    .font(.system(.body, design: .monospaced))
                    .frame(minHeight: 180)
                    .scrollContentBackground(.hidden)
                    .padding(6)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Color(nsColor: .textBackgroundColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(Color.secondary.opacity(0.2))
                    )
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Speech

private struct SpeechSection: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Form {
            Section {
                LabeledContent("识别语言") {
                    Picker("", selection: $state.preferences.language) {
                        ForEach(SpeechLanguage.allCases, id: \.self) { lang in
                            Text(lang.displayName).tag(lang)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .frame(maxWidth: 240)
                }
            } footer: {
                Text("使用系统 SFSpeechRecognizer。首次运行会申请麦克风与语音识别权限。")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Script

private struct ScriptSection: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Form {
            Section {
                TextEditor(text: $state.preferences.script)
                    .font(.system(size: 14))
                    .frame(minHeight: 280)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(Color(nsColor: .textBackgroundColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .strokeBorder(Color.secondary.opacity(0.2))
                    )
            } header: {
                HStack {
                    Text("稿件文本")
                    Spacer()
                    Text("\(state.preferences.script.count) 字")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } footer: {
                Text("会议模式下朗读的文本。可中英混合，标点自动忽略。")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Resume

private struct ResumeSection: View {
    @EnvironmentObject var state: AppState
    @State private var parseError: String?
    @State private var showError = false

    private var hasResume: Bool {
        !state.preferences.resumeText.isEmpty
    }

    var body: some View {
        Form {
            Section {
                if hasResume {
                    HStack {
                        Image(systemName: "doc.fill")
                            .foregroundStyle(.blue)
                        Text(state.preferences.resumeFileName)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer()
                        Button("清除") {
                            state.preferences.resumeText = ""
                            state.preferences.resumeFileName = ""
                        }
                        .foregroundStyle(.red)
                        Button("重新上传") { pickPDF() }
                    }
                } else {
                    Button {
                        pickPDF()
                    } label: {
                        Label("选择 PDF 文件…", systemImage: "doc.badge.plus")
                    }
                    .buttonStyle(.borderless)
                }
            } header: {
                Text("简历文件")
            } footer: {
                Text("上传 PDF 简历后自动解析为文本。面试模式下 LLM 会参考简历内容作答。")
                    .foregroundStyle(.secondary)
            }

            if hasResume {
                Section {
                    TextEditor(text: $state.preferences.resumeText)
                        .font(.system(size: 13))
                        .frame(minHeight: 280)
                        .scrollContentBackground(.hidden)
                        .padding(8)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color(nsColor: .textBackgroundColor))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .strokeBorder(Color.secondary.opacity(0.2))
                        )
                } header: {
                    HStack {
                        Text("解析结果")
                        Spacer()
                        Text("\(state.preferences.resumeText.count) 字")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("可直接编辑修正解析不准确的内容。")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .alert("简历解析失败", isPresented: $showError) {
            Button("确定", role: .cancel) {}
        } message: {
            Text(parseError ?? "未知错误")
        }
    }

    private func pickPDF() {
        let panel = NSOpenPanel()
        panel.title = "选择简历 PDF"
        panel.allowedContentTypes = [.pdf]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK, let url = panel.url else { return }

        do {
            let text = try ResumeParser.extractText(from: url)
            state.preferences.resumeText = text
            state.preferences.resumeFileName = url.lastPathComponent
        } catch {
            parseError = error.localizedDescription
            showError = true
        }
    }
}

// MARK: - Island

private struct IslandSection: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        Form {
            Section("行为") {
                LabeledContent("无语音自动收起") {
                    Stepper(value: $state.preferences.autoHideSeconds, in: 3...30) {
                        Text("\(state.preferences.autoHideSeconds) 秒")
                            .font(.system(.body, design: .monospaced))
                            .frame(minWidth: 60, alignment: .trailing)
                    }
                }
            }

            Section {
                LabeledContent("面试 VAD 静音阈值") {
                    HStack(spacing: 12) {
                        Slider(value: $state.preferences.interviewVADSilence, in: 1.0...5.0, step: 0.1)
                            .frame(maxWidth: 240)
                        Text(String(format: "%.1f s", state.preferences.interviewVADSilence))
                            .font(.system(.body, design: .monospaced))
                            .frame(width: 56, alignment: .trailing)
                    }
                }
            } header: {
                Text("面试模式")
            } footer: {
                Text("面试官停顿这么长后视为问题结束并发给 LLM。太短会切断长问题，太长会让回答迟。推荐 2.5–3.0 秒。")
                    .foregroundStyle(.secondary)
            }

            Section {
                LabeledContent("展开显示行数") {
                    Picker("", selection: $state.preferences.teleprompterLines) {
                        Text("1 行").tag(1)
                        Text("2 行").tag(2)
                        Text("3 行").tag(3)
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 280)
                }
            } header: {
                Text("展开形态")
            } footer: {
                Text("多行模式：文本按宽度自动换行，光标会让对应段落滚动到顶部。推荐 2 行，兼顾信息量和视野干扰。")
                    .foregroundStyle(.secondary)
            }

            Section {
                Toggle(isOn: $state.preferences.hideFromScreenShare) {
                    Text("屏幕共享时隐藏提词面板")
                }
                .toggleStyle(.switch)
            } footer: {
                Text("开启后腾讯会议、Zoom、系统录屏等都看不到提词器（NSWindow.sharingType = .none）。")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - About

private struct AboutSection: View {
    var body: some View {
        Form {
            Section {
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [Color(white: 0.25), Color.black],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 56, height: 56)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
                            )
                        Image(systemName: "captions.bubble.fill")
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(Color.white)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text("OpenTeleprompter").font(.title3).bold()
                        Text("Version 0.1.0").font(.caption).foregroundStyle(.secondary)
                        Text("Swift 6 · SwiftUI / AppKit")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            }

            Section("全局快捷键") {
                HotkeyRow(key: "⌘⌥ Space", desc: "面试模式手动触发\"问题结束\"")
                HotkeyRow(key: "⌘⇧ T", desc: "显示 / 隐藏灵动岛")
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Building blocks

private struct HotkeyRow: View {
    let key: String
    let desc: String

    var body: some View {
        LabeledContent {
            Text(desc).foregroundStyle(.secondary)
        } label: {
            Text(key)
                .font(.system(.body, design: .monospaced))
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(Color.secondary.opacity(0.15))
                )
        }
    }
}
