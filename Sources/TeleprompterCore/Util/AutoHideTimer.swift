import Foundation

/// 10 秒（可配）无语音自动收起。每次检测到声音调用 pet()。
public final class AutoHideTimer: @unchecked Sendable {
    private let interval: TimeInterval
    private let onFire: @Sendable () -> Void
    private let queue: DispatchQueue
    private var workItem: DispatchWorkItem?

    public init(interval: TimeInterval, queue: DispatchQueue = .main, onFire: @Sendable @escaping () -> Void) {
        self.interval = interval
        self.onFire = onFire
        self.queue = queue
    }

    /// 启动计时器；如果已在运行则重置。
    public func start() {
        pet()
    }

    /// 喂狗：重置倒计时。
    public func pet() {
        queue.async { [weak self] in
            guard let self else { return }
            self.workItem?.cancel()
            let item = DispatchWorkItem { [weak self] in
                self?.onFire()
            }
            self.workItem = item
            self.queue.asyncAfter(deadline: .now() + self.interval, execute: item)
        }
    }

    public func stop() {
        queue.async { [weak self] in
            self?.workItem?.cancel()
            self?.workItem = nil
        }
    }
}
