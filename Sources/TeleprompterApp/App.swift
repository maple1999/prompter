import SwiftUI
import AppKit

@main
struct TeleprompterAppEntry: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        // App 本体是纯 AppKit 菜单栏 + 浮层 + 独立设置窗口，没有 SwiftUI scene。
        // 提供一个隐藏的空 Settings scene 以避免 SwiftUI 在 App 启动时抱怨缺少场景。
        Settings { EmptyView() }
    }
}

