import { BrowserWindow } from 'electron';
import * as path from 'path';

export class SettingsWindow {
  private window: BrowserWindow | null = null;
  private preloadPath: string;

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;
  }

  show() {
    if (this.window) {
      if (this.window.isMinimized()) this.window.restore();
      this.window.focus();
      return;
    }

    this.window = new BrowserWindow({
      width: 720,
      height: 560,
      resizable: true,
      title: '设置 - OpenTeleprompter',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Dark mode by default for native elements
    this.window.setBackgroundColor('#1a1a1a');

    this.window.loadFile(path.join(__dirname, '../../renderer/settings/index.html'));

    this.window.on('closed', () => {
      this.window = null;
    });
  }

  close() {
    if (this.window) {
      this.window.close();
    }
  }
}
