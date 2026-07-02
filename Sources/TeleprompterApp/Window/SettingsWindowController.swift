import AppKit
import SwiftUI

/// 独立的设置窗口控制器。
///
/// SwiftUI 的 `Settings { }` scene 依赖标准主菜单里的 "Settings…" 项来触发 `showSettingsWindow:`，
/// 而 accessory 应用（LSUIElement=true）没有可见的主菜单，这条 action 经常丢。
/// 所以这里直接用 AppKit 的 NSWindow + NSHostingView 管理。
@MainActor
final class SettingsWindowController {
    private let state: AppState
    private var window: NSWindow?

    init(state: AppState) {
        self.state = state
    }

    func show() {
        if window == nil {
            let hosting = NSHostingView(
                rootView: SettingsView().environmentObject(state)
            )
            hosting.frame = NSRect(x: 0, y: 0, width: 720, height: 520)

            let w = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 720, height: 520),
                styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            w.title = "OpenTeleprompter 设置"
            w.titlebarAppearsTransparent = true
            w.contentView = hosting
            w.isReleasedWhenClosed = false
            w.center()
            self.window = w
        }
        // accessory app 要主动激活才能让新窗口拿到焦点
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}
