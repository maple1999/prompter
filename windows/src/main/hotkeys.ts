import { globalShortcut } from 'electron';
import { EventEmitter } from 'events';

/** 快捷键 → 事件。注册失败（被其他应用占用）会打日志并返回失败列表，不静默吞掉。 */
export class HotkeyManager extends EventEmitter {
  private static readonly BINDINGS: Array<{ accelerator: string; event: string }> = [
    // 结束听题并作答（面试模式）
    { accelerator: 'CommandOrControl+Alt+Space', event: 'hotkey:finalize-question' },
    // 显示/隐藏药丸
    { accelerator: 'CommandOrControl+Shift+T', event: 'hotkey:toggle-pill' },
    // 笔试截图答题
    { accelerator: 'CommandOrControl+Alt+Q', event: 'hotkey:capture-quiz' },
  ];

  /** 返回注册失败的快捷键列表。 */
  register(): string[] {
    const failed: string[] = [];
    for (const { accelerator, event } of HotkeyManager.BINDINGS) {
      const ok = globalShortcut.register(accelerator, () => {
        this.emit(event);
      });
      if (!ok) {
        failed.push(accelerator);
        console.warn(`[Hotkeys] 注册失败（可能被其他应用占用）: ${accelerator}`);
      }
    }
    return failed;
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
  }
}
