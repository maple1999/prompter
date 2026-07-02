import { contextBridge, ipcRenderer } from 'electron';
import { IPC, IslandState, Preferences } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  // Pill Window
  onStateUpdate: (callback: (state: IslandState) => void) => {
    ipcRenderer.on(IPC.PILL_STATE_UPDATE, (_event, state) => callback(state));
  },

  // Settings Window
  loadPreferences: (): Promise<Preferences> => ipcRenderer.invoke(IPC.SETTINGS_LOAD),
  savePreferences: (prefs: Partial<Preferences>): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_SAVE, prefs),
  uploadResume: (): Promise<{fileName: string, text: string} | null> => ipcRenderer.invoke(IPC.SETTINGS_UPLOAD_RESUME),
  clearResume: (): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_CLEAR_RESUME),
});
