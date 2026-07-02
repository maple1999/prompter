import SwiftUI
import TeleprompterCore

struct CompactView: View {
    @EnvironmentObject var state: AppState

    private var modeColor: Color {
        switch state.sessionMode {
        case .meeting:   return Color(red: 0.30, green: 0.85, blue: 0.55)   // 绿
        case .interview: return Color(red: 0.40, green: 0.70, blue: 1.0)    // 蓝
        case .quiz:      return Color(red: 0.95, green: 0.70, blue: 0.30)   // 橙
        }
    }

    private var modeIcon: String {
        switch state.sessionMode {
        case .meeting:   return "text.bubble"
        case .interview: return "person.wave.2"
        case .quiz:      return "viewfinder"
        }
    }

    private var modeLabel: String {
        switch state.sessionMode {
        case .meeting:   return "会议"
        case .interview: return "面试"
        case .quiz:      return "笔试"
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(modeColor)
                .frame(width: 6, height: 6)

            Image(systemName: modeIcon)
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(Color.white)
                .font(.system(size: 13, weight: .semibold))

            Text(modeLabel)
                .foregroundStyle(Color.white.opacity(0.92))
                .font(.system(size: 12.5, weight: .medium))
                .tracking(0.2)
        }
        .frame(minWidth: 120, minHeight: 28)
    }
}
