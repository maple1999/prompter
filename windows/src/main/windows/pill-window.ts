import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
import { IslandState, IPC } from '../../shared/types';

export class PillWindow {
  public window: BrowserWindow;

  constructor(preloadPath: string) {
    this.window = new BrowserWindow({
      width: 200,
      height: 40,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Default position: top center of primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;
    this.window.setPosition(Math.floor(width / 2 - 100), 20);

    // Load the HTML file
    this.window.loadFile(path.join(__dirname, '../../renderer/pill/index.html'));
    
    // Always visible on all workspaces
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  updateState(state: IslandState) {
    // Resize window based on state
    const bounds = this.window.getBounds();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    
    let targetWidth = 200;
    let targetHeight = 40;

    switch (state.type) {
      case 'hidden':
        this.window.hide();
        return;
      case 'compact':
        targetWidth = 200;
        targetHeight = 40;
        break;
      case 'expanded':
        targetWidth = 360;
        targetHeight = 60;
        break;
      case 'listening':
        targetWidth = state.transcript ? 560 : 280;
        targetHeight = 52;
        break;
      case 'thinking':
        targetWidth = 280;
        targetHeight = 52;
        break;
      case 'teleprompter':
        // Estimate height based on number of lines
        const lines = Math.min(3, Math.ceil(state.payload.displayTokens.length / 15) || 1);
        targetWidth = 680;
        targetHeight = 40 + lines * 24;
        break;
      case 'error':
        targetWidth = 380;
        targetHeight = 60;
        break;
    }

    if (state.type !== 'hidden' && !this.window.isVisible()) {
      this.window.showInactive();
    }

    // Keep it centered horizontally
    const targetX = Math.floor(screenWidth / 2 - targetWidth / 2);
    
    // Animate bounds change
    this.window.setBounds({
      x: targetX,
      y: bounds.y,
      width: targetWidth,
      height: targetHeight
    }, true);

    // Send state to renderer
    this.window.webContents.send(IPC.PILL_STATE_UPDATE, state);
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
