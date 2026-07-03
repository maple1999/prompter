import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
import { IslandState, SessionMode, IPC } from '../../shared/types';

/**
 * 药丸浮窗。窗口是透明的，真实外观由 CSS 里的 #pill 决定；
 * 窗口尺寸按状态给出「CSS 尺寸 + 余量」，宁大勿裁。
 *
 * 位置策略：宽度变化时围绕当前中心点重排（用户拖到哪里就留在哪里），
 * 不再强制回到屏幕水平中央。
 */
export class PillWindow {
  public window: BrowserWindow;
  private lastState: IslandState = { type: 'compact' };
  private lastMode: SessionMode = 'meeting';

  constructor(preloadPath: string) {
    this.window = new BrowserWindow({
      width: 240,
      height: 56,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      // 点击药丸不抢焦点（对应 macOS 非激活 NSPanel）
      focusable: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        // preload 里 require 了共享模块，必须关掉 preload 沙箱
        sandbox: false,
      },
    });

    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // 默认位置：主显示器顶部中央
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;
    this.window.setPosition(Math.floor(width / 2 - 120), 12);

    this.window.loadFile(path.join(__dirname, '../../../src/renderer/pill/index.html'));

    // 渲染页加载完成后补发当前状态与模式（避免早期消息丢失）
    this.window.webContents.on('did-finish-load', () => {
      this.window.webContents.send(IPC.PILL_MODE_UPDATE, this.lastMode);
      this.window.webContents.send(IPC.PILL_STATE_UPDATE, this.lastState);
    });
  }

  updateState(state: IslandState) {
    this.lastState = state;

    if (state.type === 'hidden') {
      this.window.hide();
      return;
    }

    const { width: targetWidth, height: targetHeight } = PillWindow.sizeFor(state);

    if (!this.window.isVisible()) {
      this.window.showInactive();
    }

    // 围绕当前中心点重排，保留用户拖动后的位置；并夹在工作区内
    const bounds = this.window.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const display = screen.getDisplayNearestPoint({ x: Math.round(centerX), y: bounds.y });
    const wa = display.workArea;
    let targetX = Math.round(centerX - targetWidth / 2);
    targetX = Math.max(wa.x, Math.min(targetX, wa.x + wa.width - targetWidth));
    const targetY = Math.max(wa.y, Math.min(bounds.y, wa.y + wa.height - targetHeight));

    this.window.setBounds({
      x: targetX,
      y: targetY,
      width: targetWidth,
      height: targetHeight,
    });

    this.window.webContents.send(IPC.PILL_STATE_UPDATE, state);
  }

  setMode(mode: SessionMode) {
    this.lastMode = mode;
    this.window.webContents.send(IPC.PILL_MODE_UPDATE, mode);
  }

  /** 各状态的窗口尺寸 = CSS 药丸尺寸 + 余量（透明窗口大一点无害，小了会裁内容）。 */
  private static sizeFor(state: IslandState): { width: number; height: number } {
    switch (state.type) {
      case 'compact':
        return { width: 240, height: 56 };
      case 'expanded':
        return { width: 400, height: 76 };
      case 'listening':
        return state.transcript
          ? { width: 600, height: 68 }
          : { width: 320, height: 68 };
      case 'thinking':
        return { width: 320, height: 68 };
      case 'teleprompter': {
        // 按显示文本总长估行数（CJK 14px，一行约 45 字），1~3 行
        const totalChars = state.payload.displayTokens.reduce((sum, t) => sum + t.length, 0);
        const lines = Math.min(3, Math.max(1, Math.ceil(totalChars / 45)));
        return { width: 720, height: 44 + lines * 24 + 16 };
      }
      case 'quiz-answer':
        return { width: 720, height: 170 };
      case 'error':
        return { width: 420, height: 76 };
      default:
        return { width: 240, height: 56 };
    }
  }

  show() {
    this.window.showInactive();
  }

  hide() {
    this.window.hide();
  }

  toggle() {
    if (this.window.isVisible()) {
      this.window.hide();
    } else {
      this.window.showInactive();
    }
  }

  setHideFromCapture(hide: boolean) {
    this.window.setContentProtection(hide);
  }
}
