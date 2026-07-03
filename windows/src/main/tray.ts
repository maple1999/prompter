import { Tray, Menu, nativeImage } from 'electron';
import { EventEmitter } from 'events';
import { SessionMode, IPC } from '../shared/types';

/** 程序化画一个 16×16 的圆点图标（BGRA）。SVG 不被 createFromBuffer 支持，会得到空图标。 */
function buildTrayIcon(): Electron.NativeImage {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = 6.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      // 1px 软边抗锯齿
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - dist));
      const v = Math.round(255 * coverage); // 白色 premultiplied
      const i = (y * size + x) * 4;
      buffer[i] = v;     // B
      buffer[i + 1] = v; // G
      buffer[i + 2] = v; // R
      buffer[i + 3] = v; // A
    }
  }
  return nativeImage.createFromBitmap(buffer, { width: size, height: size });
}

export class TrayManager extends EventEmitter {
  private tray: Tray;
  private currentMode: SessionMode = 'meeting';

  constructor() {
    super();
    this.tray = new Tray(buildTrayIcon());
    this.tray.setToolTip('OpenTeleprompter');
    this.updateMenu();
  }

  setMode(mode: SessionMode) {
    this.currentMode = mode;
    this.updateMenu();
  }

  setToolTip(text: string) {
    this.tray.setToolTip(text);
  }

  private updateMenu() {
    const contextMenu = Menu.buildFromTemplate([
      { label: '会话', enabled: false },
      { label: '开始', click: () => this.emit(IPC.SESSION_START) },
      { label: '停止', click: () => this.emit(IPC.SESSION_STOP) },
      { label: '导出面试记录', click: () => this.emit(IPC.EXPORT_TRANSCRIPT) },
      { type: 'separator' },
      { label: '模式', enabled: false },
      {
        label: '会议模式',
        type: 'radio',
        checked: this.currentMode === 'meeting',
        click: () => this.emit(IPC.SESSION_MODE_CHANGE, 'meeting'),
      },
      {
        label: '面试模式',
        type: 'radio',
        checked: this.currentMode === 'interview',
        click: () => this.emit(IPC.SESSION_MODE_CHANGE, 'interview'),
      },
      {
        label: '笔试模式',
        type: 'radio',
        checked: this.currentMode === 'quiz',
        click: () => this.emit(IPC.SESSION_MODE_CHANGE, 'quiz'),
      },
      { type: 'separator' },
      { label: '显示/隐藏药丸', click: () => this.emit(IPC.TOGGLE_PILL) },
      { label: '设置…', click: () => this.emit(IPC.OPEN_SETTINGS) },
      { type: 'separator' },
      { label: '退出', role: 'quit' },
    ]);

    this.tray.setContextMenu(contextMenu);
  }
}
