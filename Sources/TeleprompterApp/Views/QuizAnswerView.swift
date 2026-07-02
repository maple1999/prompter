import SwiftUI
import TeleprompterCore

/// 笔试答案展示视图。布局：
///   [小标签 选择/填空/代码] [大字答案 / "✓ 已复制到剪贴板"]
///   ─────────────────────
///   思路：xxx（灰色小字，可滚动）
struct QuizAnswerView: View {
    let payload: QuizAnswerPayload

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                kindBadge
                Spacer(minLength: 8)
                answerDisplay
            }
            Divider()
                .overlay(Color.white.opacity(0.12))
            ScrollView(.vertical, showsIndicators: false) {
                Text("思路：\(payload.reasoning)")
                    .foregroundStyle(Color.white.opacity(0.78))
                    .font(.system(size: 12.5, weight: .regular))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var kindBadge: some View {
        Text(kindLabel)
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.3)
            .foregroundStyle(Color.white.opacity(0.92))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(badgeColor.opacity(0.25))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(badgeColor.opacity(0.5), lineWidth: 0.5)
            )
    }

    @ViewBuilder
    private var answerDisplay: some View {
        switch payload.kind {
        case .choice, .fill:
            Text(payload.answer.isEmpty ? "—" : payload.answer)
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        case .coding:
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Color(red: 0.40, green: 0.85, blue: 0.55))
                    .font(.system(size: 16, weight: .semibold))
                Text(payload.codeCopied ? "已复制到剪贴板" : "代码")
                    .foregroundStyle(Color.white.opacity(0.95))
                    .font(.system(size: 14, weight: .medium))
                    .tracking(0.2)
            }
        }
    }

    private var kindLabel: String {
        switch payload.kind {
        case .choice: return "选择"
        case .fill:   return "填空"
        case .coding: return "代码"
        }
    }

    private var badgeColor: Color {
        switch payload.kind {
        case .choice: return Color(red: 0.40, green: 0.70, blue: 1.0)
        case .fill:   return Color(red: 0.85, green: 0.65, blue: 0.30)
        case .coding: return Color(red: 0.40, green: 0.85, blue: 0.55)
        }
    }
}
