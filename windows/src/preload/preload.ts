import { contextBridge, ipcRenderer } from 'electron';
import { IPC, IslandState, Preferences, SessionMode } from '../shared/types';

// 药丸 / 设置窗口共用的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // Pill Window
  onStateUpdate: (callback: (state: IslandState) => void) => {
    ipcRenderer.on(IPC.PILL_STATE_UPDATE, (_event, state) => callback(state));
  },
  onModeUpdate: (callback: (mode: SessionMode) => void) => {
    ipcRenderer.on(IPC.PILL_MODE_UPDATE, (_event, mode) => callback(mode));
  },

  // Settings Window
  loadPreferences: (): Promise<Preferences> => ipcRenderer.invoke(IPC.SETTINGS_LOAD),
  savePreferences: (prefs: Partial<Preferences>): Promise<void> =>
    ipcRenderer.invoke(IPC.SETTINGS_SAVE, prefs),
  uploadResume: (): Promise<{ fileName: string; text: string } | { error: string } | null> =>
    ipcRenderer.invoke(IPC.SETTINGS_UPLOAD_RESUME),
  clearResume: (): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_CLEAR_RESUME),
});

// 隐藏音频采集窗口专用
contextBridge.exposeInMainWorld('captureAPI', {
  onCommand: (callback: (cmd: { action: string; source?: string }) => void) => {
    ipcRenderer.on(IPC.CAPTURE_COMMAND, (_event, cmd) => callback(cmd));
  },
  sendPcm: (pcm: Float32Array) => ipcRenderer.send(IPC.CAPTURE_PCM, pcm),
  sendStarted: () => ipcRenderer.send(IPC.CAPTURE_STARTED),
  sendError: (message: string) => ipcRenderer.send(IPC.CAPTURE_ERROR, message),
});

// 交互选区窗口专用
contextBridge.exposeInMainWorld('regionAPI', {
  onInit: (callback: (payload: { dataURL: string }) => void) => {
    ipcRenderer.on(IPC.REGION_INIT, (_event, payload) => callback(payload));
  },
  done: (rect: { x: number; y: number; width: number; height: number } | null) =>
    ipcRenderer.send(IPC.REGION_DONE, rect),
});
