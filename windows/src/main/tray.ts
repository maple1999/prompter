import { Tray, Menu, nativeImage, EventEmitter } from 'electron';
import { SessionMode, IPC } from '../../shared/types';

export class TrayManager extends EventEmitter {
  private tray: Tray;
  private currentMode: SessionMode = 'meeting';

  constructor() {
    super();
    // Create a simple icon programmatically for now
    const canvas = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#ffffff" opacity="0.8"/></svg>'
    );
    const icon = nativeImage.createFromBuffer(canvas, { scaleFactor: 1 });
    
    this.tray = new Tray(icon);
    this.tray.setToolTip('OpenTeleprompter');
    this.updateMenu();
  }

  setMode(mode: SessionMode) {
    this.currentMode = mode;
    this.updateMenu();
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
        click: () => this.emit(IPC.SESSION_MODE_CHANGE, 'meeting')
      },
      { 
        label: '面试模式', 
        type: 'radio', 
        checked: this.currentMode === 'interview',
        click: () => this.emit(IPC.SESSION_MODE_CHANGE, 'interview')
      },
      { 
        label: '笔试模式', 
        type: 'radio', 
        checked: this.currentMode === 'quiz',
        click: () => this.emit(IPC.SESSION_MODE_CHANGE, 'quiz')
      },
      { type: 'separator' },
      { label: '显示/隐藏药丸', click: () => this.emit(IPC.TOGGLE_PILL) },
      { label: '设置…', click: () => this.emit(IPC.OPEN_SETTINGS) },
      { type: 'separator' },
      { label: '退出', role: 'quit' }
    ]);

    this.tray.setContextMenu(contextMenu);
  }
}
