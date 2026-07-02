import SwiftUI
import TeleprompterCore

struct IslandRootView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        GeometryReader { geo in
            let layout = NotchGeometry.current()
            // 圆角半径随 pill 高度自适应；上限 44 避免 3 行提词器时过度发圆
            let radius = min(geo.size.height * 0.5, 44)
            let shape = UnevenRoundedRectangle(
                cornerRadii: RectangleCornerRadii(
                    topLeading: 0,
                    bottomLeading: radius,
                    bottomTrailing: radius,
                    topTrailing: 0
                ),
                style: .continuous
            )

            ZStack(alignment: .top) {
                shape.fill(Color.black)

                // 内沿高光：底部 6pt 白色微渐变，模拟胶囊腹面的反光
                shape
                    .fill(
                        LinearGradient(
                            colors: [Color.white.opacity(0.07), Color.clear],
                            startPoint: .bottom,
                            endPoint: .init(x: 0.5, y: 0.85)
                        )
                    )
                    .allowsHitTesting(false)

                // 1px 内描边，亮壁纸下勾出胶囊轮廓
                shape
                    .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
                    .allowsHitTesting(false)

                content
                    .padding(.horizontal, NotchGeometry.teleprompterHorizontalInset)
                    .padding(.top, layout.notchHeight + 2)
                    .padding(.bottom, NotchGeometry.teleprompterVerticalInset)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .ignoresSafeArea()
        .animation(.spring(response: 0.38, dampingFraction: 0.82), value: state.islandState)
    }

    @ViewBuilder
    private var content: some View {
        switch state.islandState {
        case .hidden, .compact:
            EmptyView()
        case .expanded:
            CompactView()
                .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .top)))
        case .listening(let text):
            ListeningView(transcript: text)
                .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .top)))
        case .thinking:
            ThinkingView()
                .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .top)))
        case .teleprompter(let payload):
            if let quiz = state.quizAnswer {
                QuizAnswerView(payload: quiz)
                    .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .top)))
            } else {
                TeleprompterView(payload: payload, lines: state.preferences.teleprompterLines)
                    .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .top)))
            }
        case .error(let msg):
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(Color.orange)
                    .font(.system(size: 14, weight: .semibold))
                Text(msg)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.95))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .top)))
        }
    }
}
