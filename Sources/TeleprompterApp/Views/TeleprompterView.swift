import SwiftUI
import TeleprompterCore

struct TeleprompterView: View {
    let payload: TeleprompterPayload
    let lines: Int

    var body: some View {
        if lines <= 1 {
            singleLine
        } else {
            multiLine
        }
    }

    // MARK: - 单行：横向 ScrollView，跟随光标左移
    private var singleLine: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(Array(payload.displayTokens.enumerated()), id: \.offset) { idx, text in
                        token(text: text, idx: idx)
                    }
                    Color.clear.frame(width: 100).id("tail")
                }
            }
            .frame(height: NotchGeometry.teleprompterLineHeight)
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0.0),
                        .init(color: .black, location: 0.025),
                        .init(color: .black, location: 0.92),
                        .init(color: .clear, location: 1.0)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .onChange(of: payload.cursor) { _, new in
                withAnimation(.easeOut(duration: 0.25)) {
                    proxy.scrollTo(max(0, new - 2), anchor: .leading)
                }
            }
        }
    }

    // MARK: - 多行：流式换行 + 垂直 ScrollView，跟随光标滚动
    private var multiLine: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                FlowLayout(spacing: 0, lineSpacing: 4) {
                    ForEach(Array(payload.displayTokens.enumerated()), id: \.offset) { idx, text in
                        token(text: text, idx: idx)
                            .fixedSize()
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .frame(height: CGFloat(max(1, lines)) * NotchGeometry.teleprompterLineHeight)
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0.0),
                        .init(color: .black, location: 0.06),
                        .init(color: .black, location: 0.94),
                        .init(color: .clear, location: 1.0)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .onChange(of: payload.cursor) { _, new in
                withAnimation(.easeOut(duration: 0.25)) {
                    proxy.scrollTo(max(0, new - 1), anchor: .top)
                }
            }
        }
    }

    @ViewBuilder
    private func token(text: String, idx: Int) -> some View {
        let isCursor = idx == payload.cursor
        Text(text)
            .foregroundStyle(color(for: payload.statuses[idx]))
            .font(.system(size: NotchGeometry.teleprompterFontSize, weight: .medium))
            .background(
                Group {
                    if isCursor {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(Color.white.opacity(0.10))
                    }
                }
            )
            .id(idx)
    }

    private func color(for status: TokenStatus) -> Color {
        switch status {
        case .matched: return .white.opacity(0.40)
        case .skipped: return .white.opacity(0.22)
        case .unread:  return .white
        }
    }
}
