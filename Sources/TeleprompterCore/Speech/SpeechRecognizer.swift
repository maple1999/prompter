import Foundation
import AVFoundation
import Speech

public enum SpeechRecognizerError: Error, Sendable {
    case authorizationDenied
    case notAvailable
    case audioEngineFailed(String)
    case recognitionFailed(String)
}

public struct TranscriptionUpdate: Sendable {
    public let text: String
    public let isFinal: Bool
    public init(text: String, isFinal: Bool) {
        self.text = text
        self.isFinal = isFinal
    }
}

/// 包装 `SFSpeechRecognizer` + `SFSpeechAudioBufferRecognitionRequest`，
/// 对外暴露一个 transcript 的 AsyncStream。
/// 调用方自行提供 PCM 音频 buffer（来自麦克风或系统音频 tap）。
public final class SpeechRecognizer: @unchecked Sendable {
    private let locale: Locale
    private let requiresOnDevice: Bool

    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var continuation: AsyncStream<TranscriptionUpdate>.Continuation?

    public init(locale: Locale, requiresOnDevice: Bool = false) {
        self.locale = locale
        self.requiresOnDevice = requiresOnDevice
    }

    public static func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
        }
    }

    /// 开始识别。返回的 AsyncStream 持续吐 partial/final 更新，直到 `stop()` 或出错。
    public func start() throws -> AsyncStream<TranscriptionUpdate> {
        guard let recognizer = SFSpeechRecognizer(locale: locale) else {
            throw SpeechRecognizerError.notAvailable
        }
        guard recognizer.isAvailable else {
            throw SpeechRecognizerError.notAvailable
        }
        self.recognizer = recognizer

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if requiresOnDevice, recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        let (stream, cont) = AsyncStream<TranscriptionUpdate>.makeStream()
        self.continuation = cont

        self.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                self.continuation?.yield(TranscriptionUpdate(text: text, isFinal: result.isFinal))
                if result.isFinal {
                    self.continuation?.finish()
                }
            }
            if error != nil {
                self.continuation?.finish()
            }
        }

        cont.onTermination = { @Sendable [weak self] _ in
            self?.stop()
        }
        return stream
    }

    /// 追加一段音频 buffer。
    public func append(_ buffer: AVAudioPCMBuffer) {
        request?.append(buffer)
    }

    public func stop() {
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        continuation?.finish()
        continuation = nil
    }
}
