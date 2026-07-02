import Foundation
import AppKit
import TeleprompterCore

enum ScreenCaptureError: Error, Sendable {
    case userCancelled
    case noImage
    case toolFailed(Int32)
}

/// 截屏到剪贴板的工具。
///
/// 用 `/usr/sbin/screencapture` 命令而不是 ScreenCaptureKit，原因：
///   - `screencapture` 是用户主动调起的系统工具，权限走它自己的 TCC entry，
///     不需要本 App 持有屏幕录制权限——这避开了 ad-hoc 签名 cdhash 重打就要重授权的死循环。
///   - 交互式选区直接复用 macOS 原生的十字光标 UI，不用我们做。
enum ScreenCapture {
    static func captureToClipboard(mode: ScreenCaptureMode) async throws -> Data {
        // 先清空剪贴板，避免 screencapture 取消后我们读到旧图
        let pasteboard = NSPasteboard.general
        let beforeChangeCount = pasteboard.changeCount

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        switch mode {
        case .interactive:
            process.arguments = ["-i", "-c"]
        case .fullScreen:
            process.arguments = ["-c", "-x"]
        }

        try process.run()
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                process.waitUntilExit()
                cont.resume()
            }
        }

        guard process.terminationStatus == 0 else {
            throw ScreenCaptureError.toolFailed(process.terminationStatus)
        }

        // 用户按 ESC 取消时 changeCount 不变，剪贴板里没有新图
        if pasteboard.changeCount == beforeChangeCount {
            throw ScreenCaptureError.userCancelled
        }

        // 优先读 PNG，没有就读 TIFF 转 PNG
        if let png = pasteboard.data(forType: .png) {
            return png
        }
        if let tiff = pasteboard.data(forType: .tiff),
           let rep = NSBitmapImageRep(data: tiff),
           let png = rep.representation(using: .png, properties: [:]) {
            return png
        }
        throw ScreenCaptureError.noImage
    }
}
