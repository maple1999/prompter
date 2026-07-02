import AppKit
import Foundation
import TeleprompterCore

/// 检测 notch 屏幕尺寸、以及根据 IslandState 计算窗口应占据的 rect。
/// teleprompter 状态的高度会随行数扩展。
@MainActor
enum NotchGeometry {
    struct Layout {
        let screen: NSScreen
        let hasNotch: Bool
        let notchHeight: CGFloat
        let pillWidth: CGFloat
    }

    static let teleprompterFontSize: CGFloat = 16
    static let teleprompterLineHeight: CGFloat = 24  // 16pt 字体 + 额外行距
    static let teleprompterHorizontalInset: CGFloat = 20
    static let teleprompterVerticalInset: CGFloat = 8
    static let expandedWidth: CGFloat = 680

    static func currentScreen() -> NSScreen {
        if let notchScreen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > NSStatusBar.system.thickness + 0.5 }) {
            return notchScreen
        }
        return NSScreen.main ?? NSScreen.screens.first!
    }

    static func current() -> Layout {
        let screen = currentScreen()
        let menuBarHeight = NSStatusBar.system.thickness
        let topInset = screen.safeAreaInsets.top
        let hasNotch = topInset > menuBarHeight + 0.5
        return Layout(
            screen: screen,
            hasNotch: hasNotch,
            notchHeight: hasNotch ? topInset : menuBarHeight,
            pillWidth: hasNotch ? 200 : 180
        )
    }

    static func frame(for state: IslandState, lines: Int = 1, quizMode: Bool = false, layout: Layout = current()) -> CGRect {
        let size = size(for: state, lines: lines, quizMode: quizMode, layout: layout)
        let screenFrame = layout.screen.frame
        let originX = screenFrame.midX - size.width / 2
        let originY = screenFrame.maxY - size.height
        return CGRect(origin: CGPoint(x: originX, y: originY), size: size)
    }

    static func size(for state: IslandState, lines: Int = 1, quizMode: Bool = false, layout: Layout) -> CGSize {
        let clampedLines = max(1, min(3, lines))
        switch state {
        case .hidden:
            return CGSize(width: 1, height: 1)
        case .compact:
            return CGSize(width: layout.pillWidth, height: layout.notchHeight)
        case .expanded:
            return CGSize(width: 360, height: layout.notchHeight + 56)
        case .listening(let text):
            let width: CGFloat = text.isEmpty ? 280 : 600
            return CGSize(width: width, height: layout.notchHeight + 44)
        case .thinking:
            return CGSize(width: 280, height: layout.notchHeight + 44)
        case .teleprompter:
            if quizMode {
                // 笔试答案：大字答案 + 分隔 + 3 行思路
                return CGSize(width: 680, height: layout.notchHeight + 110)
            }
            let contentHeight = CGFloat(clampedLines) * teleprompterLineHeight + teleprompterVerticalInset * 2
            return CGSize(width: expandedWidth, height: layout.notchHeight + contentHeight)
        case .error:
            return CGSize(width: 380, height: layout.notchHeight + 52)
        }
    }
}
