import AppKit
import SwiftUI
import Combine
import TeleprompterCore

/// 负责 NSPanel 的生命周期、注入 SwiftUI 根视图，并根据 IslandState 动态调整窗口尺寸/位置。
@MainActor
final class IslandWindowController {
    private let panel: NotchPanel
    private let state: AppState
    private var cancellables: Set<AnyCancellable> = []

    init(state: AppState) {
        self.state = state
        let layout = NotchGeometry.current()
        let initialFrame = NotchGeometry.frame(for: .compact, lines: state.preferences.teleprompterLines, layout: layout)
        self.panel = NotchPanel(contentRect: initialFrame)

        let hosting = NSHostingView(rootView: IslandRootView().environmentObject(state))
        hosting.frame = panel.contentView?.bounds ?? .zero
        hosting.autoresizingMask = [.width, .height]
        hosting.wantsLayer = true
        hosting.layer?.backgroundColor = .clear
        panel.contentView = hosting

        applySharingType(hideFromScreenShare: state.preferences.hideFromScreenShare)

        state.$islandState
            .removeDuplicates()
            .sink { [weak self] newState in
                self?.applyFrame(for: newState)
            }
            .store(in: &cancellables)

        // 用户在设置里改了 teleprompterLines 时，也要重排窗口
        state.$preferences
            .map(\.teleprompterLines)
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] _ in
                guard let self else { return }
                self.applyFrame(for: self.state.islandState)
            }
            .store(in: &cancellables)

        // quizAnswer 设进/清出时（islandState 不变）也要 resize
        state.$quizAnswer
            .map { $0 != nil }
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self] _ in
                guard let self else { return }
                self.applyFrame(for: self.state.islandState)
            }
            .store(in: &cancellables)

        state.$preferences
            .map(\.hideFromScreenShare)
            .removeDuplicates()
            .sink { [weak self] hide in
                self?.applySharingType(hideFromScreenShare: hide)
            }
            .store(in: &cancellables)
    }

    func show() {
        panel.orderFrontRegardless()
    }

    func hide() {
        panel.orderOut(nil)
    }

    func toggle() {
        if panel.isVisible {
            hide()
        } else {
            show()
        }
    }

    private func applyFrame(for state: IslandState) {
        let layout = NotchGeometry.current()
        let target = NotchGeometry.frame(
            for: state,
            lines: self.state.preferences.teleprompterLines,
            quizMode: self.state.quizAnswer != nil,
            layout: layout
        )
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.32
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().setFrame(target, display: true)
        }
    }

    private func applySharingType(hideFromScreenShare: Bool) {
        panel.sharingType = hideFromScreenShare ? .none : .readOnly
    }
}
