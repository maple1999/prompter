import AppKit
import SwiftUI
import Combine
import TeleprompterCore
import Carbon.HIToolbox
import UniformTypeIdentifiers

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var windowController: IslandWindowController?
    private var settingsController: SettingsWindowController?
    private(set) var appState: AppState = AppState()
    private var meetingCoordinator: MeetingSessionCoordinator?
    private var interviewCoordinator: InterviewSessionCoordinator?
    private var quizCoordinator: QuizSessionCoordinator?
    private var meetingMenuItem: NSMenuItem?
    private var interviewMenuItem: NSMenuItem?
    private var quizMenuItem: NSMenuItem?
    private var exportMenuItem: NSMenuItem?
    private var cancellables: Set<AnyCancellable> = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 隐藏 Dock 图标，保留菜单栏
        NSApp.setActivationPolicy(.accessory)

        setupStatusItem()
        setupIslandWindow()
        setupSettingsController()
        setupHotkeys()
    }

    private func setupSettingsController() {
        settingsController = SettingsWindowController(state: appState)
    }

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.image = NSImage(systemSymbolName: "captions.bubble", accessibilityDescription: "Teleprompter")
        }
        let menu = NSMenu()

        menu.addItem(Self.sectionHeader("会话"))

        let start = NSMenuItem(title: "开始", action: #selector(startCurrent), keyEquivalent: "")
        start.target = self
        start.image = NSImage(systemSymbolName: "play.fill", accessibilityDescription: nil)
        menu.addItem(start)

        let stop = NSMenuItem(title: "停止", action: #selector(stopCurrent), keyEquivalent: "")
        stop.target = self
        stop.image = NSImage(systemSymbolName: "stop.fill", accessibilityDescription: nil)
        menu.addItem(stop)

        let exportItem = NSMenuItem(title: "导出面试记录", action: #selector(exportTranscript), keyEquivalent: "")
        exportItem.target = self
        exportItem.image = NSImage(systemSymbolName: "square.and.arrow.up", accessibilityDescription: nil)
        menu.addItem(exportItem)
        self.exportMenuItem = exportItem

        menu.addItem(NSMenuItem.separator())
        menu.addItem(Self.sectionHeader("模式"))

        let meetingItem = NSMenuItem(title: "会议模式", action: #selector(selectMeetingMode), keyEquivalent: "")
        meetingItem.target = self
        meetingItem.image = NSImage(systemSymbolName: "text.bubble", accessibilityDescription: nil)
        menu.addItem(meetingItem)
        self.meetingMenuItem = meetingItem

        let interviewItem = NSMenuItem(title: "面试模式", action: #selector(selectInterviewMode), keyEquivalent: "")
        interviewItem.target = self
        interviewItem.image = NSImage(systemSymbolName: "person.wave.2", accessibilityDescription: nil)
        menu.addItem(interviewItem)
        self.interviewMenuItem = interviewItem

        let quizItem = NSMenuItem(title: "笔试模式", action: #selector(selectQuizMode), keyEquivalent: "")
        quizItem.target = self
        quizItem.image = NSImage(systemSymbolName: "viewfinder", accessibilityDescription: nil)
        menu.addItem(quizItem)
        self.quizMenuItem = quizItem

        menu.addItem(NSMenuItem.separator())
        menu.addItem(Self.sectionHeader("窗口"))

        let toggle = NSMenuItem(title: "显示/隐藏灵动岛", action: #selector(toggleIsland), keyEquivalent: "t")
        toggle.target = self
        toggle.image = NSImage(systemSymbolName: "rectangle.topthird.inset.filled", accessibilityDescription: nil)
        menu.addItem(toggle)

        let settings = NSMenuItem(title: "设置…", action: #selector(openSettings), keyEquivalent: ",")
        settings.target = self
        settings.image = NSImage(systemSymbolName: "gearshape", accessibilityDescription: nil)
        menu.addItem(settings)

        menu.addItem(NSMenuItem.separator())

        let quit = NSMenuItem(title: "退出", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quit.image = NSImage(systemSymbolName: "power", accessibilityDescription: nil)
        menu.addItem(quit)

        menu.delegate = self
        item.menu = menu
        self.statusItem = item
    }

    private static func sectionHeader(_ title: String) -> NSMenuItem {
        if #available(macOS 14.0, *) {
            return NSMenuItem.sectionHeader(title: title)
        }
        let header = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        header.isEnabled = false
        return header
    }

    private func setupIslandWindow() {
        let controller = IslandWindowController(state: appState)
        controller.show()
        self.windowController = controller
    }

    private func setupHotkeys() {
        // ⌘⌥ Space：面试模式下手动触发"问题结束"
        HotkeyManager.shared.register(
            .endInterviewerQuestion,
            keyCode: HotkeyCode.space,
            modifiers: HotkeyModifiers.cmdOpt
        ) { [weak self] in
            self?.interviewCoordinator?.finalizeQuestion()
        }
        // ⌘⇧ T：显隐灵动岛
        HotkeyManager.shared.register(
            .toggleIsland,
            keyCode: HotkeyCode.t,
            modifiers: HotkeyModifiers.cmdShift
        ) { [weak self] in
            self?.windowController?.toggle()
        }
        // 笔试助手：用户可在设置选预设
        registerQuizHotkey()

        // 用户在设置里改快捷键预设时重新注册
        appState.$preferences
            .map(\.quizHotkeyPreset)
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] _ in
                self?.registerQuizHotkey()
            }
            .store(in: &cancellables)
    }

    private func registerQuizHotkey() {
        let preset = appState.preferences.quizHotkeyPreset
        if preset == .disabled {
            HotkeyManager.shared.unregister(.captureQuiz)
            return
        }
        HotkeyManager.shared.register(
            .captureQuiz,
            keyCode: preset.keyCode,
            modifiers: preset.modifiers
        ) { [weak self] in
            self?.startQuiz()
        }
    }

    @objc private func toggleIsland() {
        windowController?.toggle()
    }

    @objc private func selectMeetingMode() {
        // 切模式前先停掉运行中的 coordinator，避免旧的麦克风 / SCStream 后台跑下去
        stopCurrent()
        appState.setMode(.meeting)
    }

    @objc private func selectInterviewMode() {
        stopCurrent()
        appState.setMode(.interview)
    }

    @objc private func selectQuizMode() {
        stopCurrent()
        appState.setMode(.quiz)
    }

    @objc private func startCurrent() {
        // 防止重复点开始：先停掉前一个 coordinator
        stopCurrent()
        switch appState.sessionMode {
        case .meeting:
            let c = MeetingSessionCoordinator(state: appState)
            meetingCoordinator = c
            Task { await c.start() }
        case .interview:
            let c = InterviewSessionCoordinator(state: appState)
            interviewCoordinator = c
            Task { await c.startListening() }
        case .quiz:
            startQuiz()
        }
    }

    @objc private func stopCurrent() {
        meetingCoordinator?.stop(collapseTo: .compact)
        interviewCoordinator?.stop(collapseTo: .compact)
        quizCoordinator?.stop(collapseTo: .compact)
        meetingCoordinator = nil
        interviewCoordinator = nil
        quizCoordinator = nil
    }

    private func startQuiz() {
        // 笔试助手与会议/面试 coordinator 互斥
        stopCurrent()
        let c = QuizSessionCoordinator(state: appState)
        quizCoordinator = c
        Task { await c.run() }
    }

    @objc private func openSettings() {
        settingsController?.show()
    }

    @objc private func exportTranscript() {
        guard let transcript = appState.interviewTranscript, !transcript.isEmpty else { return }

        let panel = NSSavePanel()
        panel.title = "导出面试记录"
        panel.nameFieldStringValue = "面试记录_\(Self.filenameDateString()).md"
        panel.allowedContentTypes = [.plainText]
        panel.canCreateDirectories = true

        guard panel.runModal() == .OK, let url = panel.url else { return }

        let markdown = transcript.exportMarkdown()
        do {
            try markdown.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            let alert = NSAlert()
            alert.messageText = "导出失败"
            alert.informativeText = error.localizedDescription
            alert.alertStyle = .warning
            alert.runModal()
        }
    }

    private static func filenameDateString() -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyyMMdd_HHmm"
        return fmt.string(from: Date())
    }
}

extension AppDelegate: NSMenuDelegate {
    func menuNeedsUpdate(_ menu: NSMenu) {
        meetingMenuItem?.state = appState.sessionMode == .meeting ? .on : .off
        interviewMenuItem?.state = appState.sessionMode == .interview ? .on : .off
        quizMenuItem?.state = appState.sessionMode == .quiz ? .on : .off
        // 只有有非空面试记录时才启用导出菜单项
        let hasTranscript = appState.interviewTranscript?.isEmpty == false
        exportMenuItem?.isEnabled = hasTranscript
    }
}
