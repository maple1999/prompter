import Foundation
import AVFoundation

/// 通过 AVAudioEngine 从系统默认输入设备（麦克风）采音，回调每块 PCM buffer。
public final class MicAudioTap: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private var running = false

    public init() {}

    public static func requestAuthorization() async -> Bool {
        if #available(macOS 14.0, *) {
            return await AVAudioApplication.requestRecordPermission()
        } else {
            return await withCheckedContinuation { cont in
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    cont.resume(returning: granted)
                }
            }
        }
    }

    /// 启动采集。每收到一块 buffer 通过 `onBuffer` 回调传出。
    public func start(onBuffer: @escaping @Sendable (AVAudioPCMBuffer) -> Void) throws {
        guard !running else { return }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            onBuffer(buffer)
        }
        engine.prepare()
        try engine.start()
        running = true
    }

    public func stop() {
        guard running else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        running = false
    }
}
