import AppKit
import Carbon.HIToolbox
import TeleprompterCore

/// 全局快捷键管理器。用 Carbon 的 RegisterEventHotKey（不需要辅助功能权限）。
@MainActor
final class HotkeyManager {
    enum Shortcut: UInt32 {
        case endInterviewerQuestion = 1
        case toggleIsland = 2
        case captureQuiz = 3
    }

    static let shared = HotkeyManager()

    private var handlers: [Shortcut: () -> Void] = [:]
    private var hotKeyRefs: [Shortcut: EventHotKeyRef] = [:]
    private var eventHandler: EventHandlerRef?

    private init() {
        installEventHandler()
    }

    func register(_ shortcut: Shortcut, keyCode: UInt32, modifiers: UInt32, handler: @escaping () -> Void) {
        unregister(shortcut)
        handlers[shortcut] = handler

        var ref: EventHotKeyRef?
        let hotkeyID = EventHotKeyID(signature: OSType(0x4f544c50) /* "OTLP" */, id: shortcut.rawValue)
        let status = RegisterEventHotKey(keyCode, modifiers, hotkeyID, GetApplicationEventTarget(), 0, &ref)
        if status == noErr, let ref {
            hotKeyRefs[shortcut] = ref
        }
    }

    func unregister(_ shortcut: Shortcut) {
        if let ref = hotKeyRefs[shortcut] {
            UnregisterEventHotKey(ref)
            hotKeyRefs[shortcut] = nil
        }
        handlers[shortcut] = nil
    }

    private func installEventHandler() {
        var eventSpec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let userData = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())

        InstallEventHandler(GetApplicationEventTarget(), { _, event, userData in
            guard let event, let userData else { return OSStatus(eventNotHandledErr) }
            var hotkeyID = EventHotKeyID()
            let err = GetEventParameter(
                event, EventParamName(kEventParamDirectObject),
                EventParamType(typeEventHotKeyID),
                nil, MemoryLayout<EventHotKeyID>.size, nil, &hotkeyID
            )
            guard err == noErr else { return OSStatus(eventNotHandledErr) }
            let manager = Unmanaged<HotkeyManager>.fromOpaque(userData).takeUnretainedValue()
            if let shortcut = Shortcut(rawValue: hotkeyID.id), let handler = manager.handlers[shortcut] {
                DispatchQueue.main.async { handler() }
            }
            return noErr
        }, 1, &eventSpec, userData, &eventHandler)
    }
}

/// 便捷的修饰键组合（Carbon 风格的 UInt32）。
enum HotkeyModifiers {
    static let cmdOpt: UInt32 = UInt32(cmdKey | optionKey)
    static let cmdShift: UInt32 = UInt32(cmdKey | shiftKey)
    static let ctrlOpt: UInt32 = UInt32(controlKey | optionKey)
}

/// 常用按键码。
enum HotkeyCode {
    static let space: UInt32 = UInt32(kVK_Space)
    static let t: UInt32 = UInt32(kVK_ANSI_T)
    static let q: UInt32 = UInt32(kVK_ANSI_Q)
    static let a: UInt32 = UInt32(kVK_ANSI_A)
}

extension QuizHotkeyPreset {
    var keyCode: UInt32 {
        switch self {
        case .ctrlOptQ:  return HotkeyCode.q
        case .cmdOptQ:   return HotkeyCode.q
        case .cmdShiftA: return HotkeyCode.a
        case .disabled:  return 0
        }
    }

    var modifiers: UInt32 {
        switch self {
        case .ctrlOptQ:  return HotkeyModifiers.ctrlOpt
        case .cmdOptQ:   return HotkeyModifiers.cmdOpt
        case .cmdShiftA: return HotkeyModifiers.cmdShift
        case .disabled:  return 0
        }
    }
}
