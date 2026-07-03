import { BrowserWindow, ipcMain, screen, desktopCapturer } from 'electron';
import * as path from 'path';
import { IPC } from '../../shared/types';

export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 截取主显示器全屏，返回原生分辨率 PNG（thumbnailSize 按 scaleFactor 放大，避免高分屏糊字）。 */
export async function captureFullScreenImage(): Promise<Electron.NativeImage> {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(primary.size.width * primary.scaleFactor),
      height: Math.round(primary.size.height * primary.scaleFactor),
    },
  });
  if (sources.length === 0) {
    throw new Error('无法枚举屏幕');
  }
  const source = sources.find((s) => s.display_id === String(primary.id)) ?? sources[0];
  const image = source.thumbnail;
  if (image.isEmpty()) {
    throw new Error('截图为空');
  }
  return image;
}

/**
 * 交互选区：先截全屏，再铺一个全屏窗口展示截图让用户拖框，
 * 返回裁剪后的 PNG；ESC / 关窗返回 null（对应 macOS screencapture -i 的取消）。
 */
export class RegionPicker {
  private preloadPath: string;

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;
  }

  async pick(): Promise<Buffer | null> {
    const primary = screen.getPrimaryDisplay();
    const image = await captureFullScreenImage();

    const win = new BrowserWindow({
      x: primary.bounds.x,
      y: primary.bounds.y,
      width: primary.bounds.width,
      height: primary.bounds.height,
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    // 选区窗口自己不进别人的屏幕共享
    win.setContentProtection(true);

    await win.loadFile(path.join(__dirname, '../../../src/renderer/region/index.html'));

    const result = await new Promise<RegionRect | null>((resolve) => {
      let settled = false;
      const finish = (rect: RegionRect | null) => {
        if (settled) return;
        settled = true;
        ipcMain.removeListener(IPC.REGION_DONE, onDone);
        resolve(rect);
      };
      const onDone = (event: Electron.IpcMainEvent, rect: RegionRect | null) => {
        if (event.sender !== win.webContents) return;
        finish(rect);
      };
      ipcMain.on(IPC.REGION_DONE, onDone);
      win.on('closed', () => finish(null));

      win.webContents.send(IPC.REGION_INIT, { dataURL: image.toDataURL() });
      win.show();
      win.focus();
    });

    if (!win.isDestroyed()) {
      win.destroy();
    }

    if (!result || result.width < 4 || result.height < 4) {
      return null;
    }

    // rect 是窗口 CSS 像素坐标；换算到截图原生像素后裁剪
    const imageSize = image.getSize();
    const scaleX = imageSize.width / primary.bounds.width;
    const scaleY = imageSize.height / primary.bounds.height;
    const cropped = image.crop({
      x: Math.max(0, Math.round(result.x * scaleX)),
      y: Math.max(0, Math.round(result.y * scaleY)),
      width: Math.min(imageSize.width, Math.round(result.width * scaleX)),
      height: Math.min(imageSize.height, Math.round(result.height * scaleY)),
    });
    return cropped.toPNG();
  }
}
