import { globalShortcut, EventEmitter } from 'electron';

export class HotkeyManager extends EventEmitter {
  register() {
    // End question shortcut (CommandOrControl+Alt+Space)
    globalShortcut.register('CommandOrControl+Alt+Space', () => {
      this.emit('hotkey:finalize-question');
    });

    // Toggle pill shortcut (CommandOrControl+Shift+T)
    globalShortcut.register('CommandOrControl+Shift+T', () => {
      this.emit('hotkey:toggle-pill');
    });

    // Capture quiz screenshot (CommandOrControl+Alt+Q)
    globalShortcut.register('CommandOrControl+Alt+Q', () => {
      this.emit('hotkey:capture-quiz');
    });
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
  }
}
