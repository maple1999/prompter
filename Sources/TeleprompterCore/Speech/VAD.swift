import Foundation

/// 简易语音活动检测（VAD）。
///
/// 本应用里 VAD 有两个信号来源：
///  1. ASR 的 partial result：每次 partial 更新说明有"可识别的语音"；
///  2. 音频 buffer 的 RMS：当 RMS 超过阈值时认为有"声音"（可用于 ASR 未启动时）。
///
/// 本类不直接接 ASR 或 buffer，而是暴露 `reportVoice()` / `cancel()`，
/// 由调用方（协调器）在合适的时刻调用。`reportVoice()` 会重置一个倒计时，
/// 倒计时走完（即长度 ≥ `silenceThreshold` 的"静默"）后触发 `onSilence`。
public final class VAD: @unchecked Sendable {
    public let silenceThreshold: TimeInterval
    public let onSilence: @Sendable () -> Void

    private let queue: DispatchQueue
    private var workItem: DispatchWorkItem?

    public init(
        silenceThreshold: TimeInterval,
        queue: DispatchQueue = .main,
        onSilence: @Sendable @escaping () -> Void
    ) {
        self.silenceThreshold = silenceThreshold
        self.queue = queue
        self.onSilence = onSilence
    }

    /// 报告"刚刚有语音"，重置计时器。
    public func reportVoice() {
        queue.async { [weak self] in
            guard let self else { return }
            self.workItem?.cancel()
            let item = DispatchWorkItem { [weak self] in
                self?.onSilence()
            }
            self.workItem = item
            self.queue.asyncAfter(deadline: .now() + self.silenceThreshold, execute: item)
        }
    }

    public func cancel() {
        queue.async { [weak self] in
            self?.workItem?.cancel()
            self?.workItem = nil
        }
    }
}
