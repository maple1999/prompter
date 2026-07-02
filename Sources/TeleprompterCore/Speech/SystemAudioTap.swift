import Foundation
import AVFoundation
import CoreAudio
import os.log

private let log = Logger(subsystem: "com.openteleprompter.app", category: "SystemAudioTap")

/// 用 Core Audio Process Tap 捕获系统输出音频。macOS 14.4+。
///
/// 这条路只需要 `kTCCServiceAudioCapture`（"系统音频录制"），不需要更宽的
/// `kTCCServiceScreenCapture`（"屏幕录制"），所以 ad-hoc 签名重打也不会触发屏幕
/// 录制授权弹窗。Apple 推荐的现代方案，AudioCap 示例就是这么做的。
///
/// 实现要点：
///   1. 用进程级 tap（`stereoMixdownOfProcesses:` + 当前所有 process audio object id）。
///      理论上 `stereoGlobalTapButExcludeProcesses: []` 是更优解但 macOS 26 实测不输出
///      buffer。这条路的代价是：tap 启动后才出现的进程不会被抓到（如终端跑 say）；
///      但用户先加入会议/打开视频再点开始，目标进程已在枚举列表里，所以实用上够了。
///   2. 包一个 private aggregate device 把 tap 列在 TapList，再 IOProc 拉音频。
///   3. AVAudioConverter 把 tap 输出（48kHz 立体声 interleaved）转成 16kHz 单声道
///      Float32 non-interleaved 再喂 SFSpeechRecognizer，否则后者识别不出。
///   4. IOProc 闭包按值捕获 converter / formats / handler，不走 `[weak self]`：
///      `AudioDeviceCreateIOProcIDWithBlock` 是 Obj-C `@convention(block)`，
///      Swift 弱引用跨这种边界会变 nil。
@available(macOS 14.4, *)
public final class SystemAudioTap: @unchecked Sendable {
    private var processTapID: AudioObjectID = 0
    private var aggregateDeviceID: AudioObjectID = 0
    private var ioProcID: AudioDeviceIOProcID?

    public init() {}

    public func start(onBuffer: @escaping @Sendable (AVAudioPCMBuffer) -> Void) async throws {
        let processIDs = try Self.allProcessAudioObjects()

        let desc = CATapDescription(stereoMixdownOfProcesses: processIDs)
        desc.uuid = UUID()
        desc.muteBehavior = .unmuted
        desc.isPrivate = true
        desc.isExclusive = false
        desc.name = "OpenTeleprompter Tap"

        var newTapID = AudioObjectID(kAudioObjectUnknown)
        let createStatus = AudioHardwareCreateProcessTap(desc, &newTapID)
        guard createStatus == noErr, newTapID != kAudioObjectUnknown else {
            log.error("AudioHardwareCreateProcessTap failed: \(createStatus, privacy: .public)")
            throw SystemAudioError.tapCreationFailed(createStatus)
        }
        self.processTapID = newTapID

        var asbd: AudioStreamBasicDescription
        do {
            asbd = try Self.tapStreamFormat(tapID: newTapID)
        } catch {
            AudioHardwareDestroyProcessTap(newTapID)
            self.processTapID = 0
            throw error
        }
        guard let avSourceFormat = AVAudioFormat(streamDescription: &asbd) else {
            AudioHardwareDestroyProcessTap(newTapID)
            self.processTapID = 0
            throw SystemAudioError.formatQueryFailed(-1)
        }

        guard let avTargetFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 16000,
            channels: 1,
            interleaved: false
        ) else {
            AudioHardwareDestroyProcessTap(newTapID)
            self.processTapID = 0
            throw SystemAudioError.formatQueryFailed(-1)
        }
        guard let conv = AVAudioConverter(from: avSourceFormat, to: avTargetFormat) else {
            AudioHardwareDestroyProcessTap(newTapID)
            self.processTapID = 0
            throw SystemAudioError.converterCreationFailed
        }

        let outputUID: String
        do {
            outputUID = try Self.defaultOutputDeviceUID()
        } catch {
            AudioHardwareDestroyProcessTap(newTapID)
            self.processTapID = 0
            throw error
        }

        let tapUIDString = desc.uuid.uuidString
        let aggregateDesc: [String: Any] = [
            kAudioAggregateDeviceNameKey: "OpenTeleprompter Capture",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceMainSubDeviceKey: outputUID,
            kAudioAggregateDeviceIsPrivateKey: 1,
            kAudioAggregateDeviceIsStackedKey: 0,
            kAudioAggregateDeviceTapAutoStartKey: 1,
            kAudioAggregateDeviceSubDeviceListKey: [
                [kAudioSubDeviceUIDKey: outputUID]
            ],
            kAudioAggregateDeviceTapListKey: [
                [
                    kAudioSubTapUIDKey: tapUIDString,
                    kAudioSubTapDriftCompensationKey: 0,
                ]
            ],
        ]

        var newAggID = AudioObjectID(kAudioObjectUnknown)
        let aggStatus = AudioHardwareCreateAggregateDevice(aggregateDesc as CFDictionary, &newAggID)
        guard aggStatus == noErr, newAggID != kAudioObjectUnknown else {
            log.error("AudioHardwareCreateAggregateDevice failed: \(aggStatus, privacy: .public)")
            AudioHardwareDestroyProcessTap(newTapID)
            self.processTapID = 0
            throw SystemAudioError.aggregateCreationFailed(aggStatus)
        }
        self.aggregateDeviceID = newAggID

        let queue = DispatchQueue(label: "com.openteleprompter.audio.tap", qos: .userInitiated)
        var newProcID: AudioDeviceIOProcID?
        let capturedSourceFormat = avSourceFormat
        let capturedTargetFormat = avTargetFormat
        let capturedConverter = conv
        let capturedHandler = onBuffer
        let ioStatus = AudioDeviceCreateIOProcIDWithBlock(&newProcID, newAggID, queue) { _, inInputData, _, _, _ in
            Self.processIOInput(
                sourceFormat: capturedSourceFormat,
                targetFormat: capturedTargetFormat,
                converter: capturedConverter,
                inputData: inInputData,
                handler: capturedHandler
            )
        }
        guard ioStatus == noErr, let procID = newProcID else {
            log.error("AudioDeviceCreateIOProcIDWithBlock failed: \(ioStatus, privacy: .public)")
            AudioHardwareDestroyAggregateDevice(newAggID)
            AudioHardwareDestroyProcessTap(newTapID)
            self.aggregateDeviceID = 0
            self.processTapID = 0
            throw SystemAudioError.ioProcFailed(ioStatus)
        }
        self.ioProcID = procID

        let startStatus = AudioDeviceStart(newAggID, procID)
        guard startStatus == noErr else {
            log.error("AudioDeviceStart failed: \(startStatus, privacy: .public)")
            AudioDeviceDestroyIOProcID(newAggID, procID)
            AudioHardwareDestroyAggregateDevice(newAggID)
            AudioHardwareDestroyProcessTap(newTapID)
            self.ioProcID = nil
            self.aggregateDeviceID = 0
            self.processTapID = 0
            throw SystemAudioError.deviceStartFailed(startStatus)
        }
    }

    public func stop() async {
        if let procID = ioProcID, aggregateDeviceID != 0 {
            AudioDeviceStop(aggregateDeviceID, procID)
            AudioDeviceDestroyIOProcID(aggregateDeviceID, procID)
        }
        if aggregateDeviceID != 0 {
            AudioHardwareDestroyAggregateDevice(aggregateDeviceID)
        }
        if processTapID != 0 {
            AudioHardwareDestroyProcessTap(processTapID)
        }
        ioProcID = nil
        aggregateDeviceID = 0
        processTapID = 0
    }

    // MARK: - IOProc

    private static func processIOInput(
        sourceFormat: AVAudioFormat,
        targetFormat: AVAudioFormat,
        converter: AVAudioConverter,
        inputData: UnsafePointer<AudioBufferList>,
        handler: @Sendable (AVAudioPCMBuffer) -> Void
    ) {
        let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inputData))
        guard let firstBuffer = abl.first else { return }
        let bytesPerFrame = sourceFormat.streamDescription.pointee.mBytesPerFrame
        guard bytesPerFrame > 0 else { return }
        let sourceFrameCount = AVAudioFrameCount(firstBuffer.mDataByteSize) / AVAudioFrameCount(bytesPerFrame)
        guard sourceFrameCount > 0 else { return }
        guard let srcBuf = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: sourceFrameCount) else { return }
        srcBuf.frameLength = sourceFrameCount

        let dst = UnsafeMutableAudioBufferListPointer(srcBuf.mutableAudioBufferList)
        for i in 0..<min(abl.count, dst.count) {
            if let dstData = dst[i].mData, let srcData = abl[i].mData {
                let bytes = Int(min(dst[i].mDataByteSize, abl[i].mDataByteSize))
                memcpy(dstData, srcData, bytes)
            }
        }

        let ratio = targetFormat.sampleRate / sourceFormat.sampleRate
        let outCapacity = AVAudioFrameCount(Double(sourceFrameCount) * ratio + 32)
        guard let outBuf = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outCapacity) else { return }

        var fed = false
        let status = converter.convert(to: outBuf, error: nil) { _, statusOut in
            if fed {
                statusOut.pointee = .noDataNow
                return nil
            }
            fed = true
            statusOut.pointee = .haveData
            return srcBuf
        }
        guard status != .error, outBuf.frameLength > 0 else { return }

        handler(outBuf)
    }

    // MARK: - CoreAudio property helpers

    private static func tapStreamFormat(tapID: AudioObjectID) throws -> AudioStreamBasicDescription {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioTapPropertyFormat,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var format = AudioStreamBasicDescription()
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        let status = AudioObjectGetPropertyData(tapID, &addr, 0, nil, &size, &format)
        guard status == noErr else {
            throw SystemAudioError.formatQueryFailed(status)
        }
        return format
    }

    private static func defaultOutputDeviceUID() throws -> String {
        var deviceID = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &addr, 0, nil, &size, &deviceID
        )
        guard status == noErr, deviceID != kAudioObjectUnknown else {
            throw SystemAudioError.outputDeviceQueryFailed(status)
        }

        var uidAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var uidUnmanaged: Unmanaged<CFString>?
        var uidSize = UInt32(MemoryLayout<CFString?>.size)
        let uidStatus = AudioObjectGetPropertyData(
            deviceID, &uidAddr, 0, nil, &uidSize, &uidUnmanaged
        )
        guard uidStatus == noErr, let cfString = uidUnmanaged?.takeRetainedValue() else {
            throw SystemAudioError.outputDeviceQueryFailed(uidStatus)
        }
        return cfString as String
    }

    private static func allProcessAudioObjects() throws -> [AudioObjectID] {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyProcessObjectList,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size: UInt32 = 0
        let sizeStatus = AudioObjectGetPropertyDataSize(
            AudioObjectID(kAudioObjectSystemObject),
            &addr, 0, nil, &size
        )
        guard sizeStatus == noErr else {
            throw SystemAudioError.processListQueryFailed(sizeStatus)
        }
        let count = Int(size) / MemoryLayout<AudioObjectID>.size
        guard count > 0 else { return [] }
        var ids = [AudioObjectID](repeating: 0, count: count)
        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &addr, 0, nil, &size, &ids
        )
        guard status == noErr else {
            throw SystemAudioError.processListQueryFailed(status)
        }
        return ids
    }

    public enum SystemAudioError: Error, Sendable {
        case tapCreationFailed(OSStatus)
        case aggregateCreationFailed(OSStatus)
        case ioProcFailed(OSStatus)
        case deviceStartFailed(OSStatus)
        case outputDeviceQueryFailed(OSStatus)
        case formatQueryFailed(OSStatus)
        case processListQueryFailed(OSStatus)
        case converterCreationFailed
    }
}
