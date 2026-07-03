import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { IPC } from '../../shared/types';

export type AudioSource = 'mic' | 'system';

/**
 * 音频采集服务：拥有一个隐藏的渲染窗口，在里面用 Web Audio 拿 PCM。
 *
 * - 麦克风：getUserMedia({ audio })
 * - 系统音频：getUserMedia({ chromeMediaSource: 'desktop' })，
 *   Windows 上 Chromium 走 WASAPI loopback（对应 macOS 的 SystemAudioTap 角色），
 *   无需任何原生 addon，也没有屏幕录制权限弹窗。
 *
 * 同一时刻只允许一个源在采集 —— 与 macOS 版「系统音频和麦克风绝不同时运行」的约束一致：
 * `start()` 会先隐式停掉上一个源。
 *
 * PCM 统一为 16 kHz mono Float32（AudioContext({sampleRate:16000}) 内部重采样）。
 */
export class AudioCaptureService {
  private window: BrowserWindow | null = null;
  private preloadPath: string;
  private onPcm: ((pcm: Float32Array) => void) | null = null;
  private pendingStart: {
    resolve: () => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  constructor(preloadPath: string) {
    this.preloadPath = preloadPath;

    ipcMain.on(IPC.CAPTURE_PCM, (_event, data: Float32Array) => {
      // structured clone 会把 Float32Array 原样送达
      this.onPcm?.(data);
    });

    ipcMain.on(IPC.CAPTURE_STARTED, () => {
      if (this.pendingStart) {
        clearTimeout(this.pendingStart.timer);
        this.pendingStart.resolve();
        this.pendingStart = null;
      }
    });

    ipcMain.on(IPC.CAPTURE_ERROR, (_event, message: string) => {
      if (this.pendingStart) {
        clearTimeout(this.pendingStart.timer);
        this.pendingStart.reject(new Error(message));
        this.pendingStart = null;
      } else {
        console.error('[AudioCapture] runtime error:', message);
      }
    });
  }

  /** 开始采集。会先停掉正在运行的源。失败（如麦克风被系统隐私设置禁用）时 reject。 */
  async start(source: AudioSource, onPcm: (pcm: Float32Array) => void): Promise<void> {
    await this.stop();
    const win = await this.ensureWindow();
    this.onPcm = onPcm;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingStart = null;
        this.onPcm = null;
        reject(new Error('音频采集启动超时'));
      }, 15_000);
      this.pendingStart = { resolve, reject, timer };
      win.webContents.send(IPC.CAPTURE_COMMAND, { action: 'start', source });
    });
  }

  async stop(): Promise<void> {
    this.onPcm = null;
    if (this.pendingStart) {
      clearTimeout(this.pendingStart.timer);
      this.pendingStart.reject(new Error('采集已被停止'));
      this.pendingStart = null;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.CAPTURE_COMMAND, { action: 'stop' });
    }
  }

  destroy(): void {
    this.onPcm = null;
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  private async ensureWindow(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }
    const win = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      skipTaskbar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // 采集页在后台窗口里跑，不能被 Chromium 节流
        backgroundThrottling: false,
      },
    });
    this.window = win;
    win.on('closed', () => {
      this.window = null;
    });
    await win.loadFile(path.join(__dirname, '../../../src/renderer/capture/index.html'));
    return win;
  }
}
