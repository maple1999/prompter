import SwiftUI

struct ListeningView: View {
    let transcript: String

    @State private var animating = false

    private let baseHeights: [CGFloat] = [6, 14, 10]
    private let phases: [Double] = [0.0, 0.15, 0.30]

    init(transcript: String = "") {
        self.transcript = transcript
    }

    var body: some View {
        HStack(spacing: 10) {
            HStack(alignment: .center, spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Capsule(style: .continuous)
                        .fill(Color(red: 1.0, green: 0.30, blue: 0.30).opacity(0.95))
                        .frame(width: 3, height: animating ? baseHeights[(i + 1) % 3] : baseHeights[i])
                        .animation(
                            .easeInOut(duration: 0.55)
                                .repeatForever(autoreverses: true)
                                .delay(phases[i]),
                            value: animating
                        )
                }
            }
            .frame(width: 18, height: 16)

            Text("听题中…")
                .foregroundStyle(Color.white.opacity(0.95))
                .font(.system(size: 12.5, weight: .medium))
                .tracking(0.2)
                .fixedSize()

            if !transcript.isEmpty {
                Rectangle()
                    .fill(Color.white.opacity(0.18))
                    .frame(width: 1, height: 14)

                Text(transcript)
                    .foregroundStyle(Color.white.opacity(0.85))
                    .font(.system(size: 12.5, weight: .regular))
                    .lineLimit(1)
                    .truncationMode(.head)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .animation(.easeOut(duration: 0.15), value: transcript)
            }
        }
        .padding(.horizontal, 8)
        .frame(minHeight: 28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear { animating = true }
    }
}
