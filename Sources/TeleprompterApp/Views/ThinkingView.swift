import SwiftUI

struct ThinkingView: View {
    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { i in
                    DotPulse(delay: Double(i) * 0.18)
                }
            }
            Text("思考中…")
                .foregroundStyle(Color.white.opacity(0.95))
                .font(.system(size: 12.5, weight: .medium))
                .tracking(0.2)
                .padding(.leading, 4)
        }
        .frame(minWidth: 160, minHeight: 28)
    }
}

private struct DotPulse: View {
    let delay: Double
    @State private var bright = false

    var body: some View {
        Circle()
            .fill(Color.white)
            .frame(width: 6, height: 6)
            .opacity(bright ? 1.0 : 0.3)
            .animation(
                .easeInOut(duration: 0.6)
                    .repeatForever(autoreverses: true)
                    .delay(delay),
                value: bright
            )
            .onAppear { bright = true }
    }
}
