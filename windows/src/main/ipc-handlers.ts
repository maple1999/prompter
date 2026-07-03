import { ipcMain, dialog } from 'electron';
import * as path from 'path';
import { IPC, Preferences } from '../shared/types';
import { PreferencesStore } from './storage/preferences';
import { PillWindow } from './windows/pill-window';
import { parseResumePDF } from './resume/parser';

export function registerIpcHandlers(store: PreferencesStore, pillWindow: PillWindow) {
  // Settings Load
  ipcMain.handle(IPC.SETTINGS_LOAD, () => {
    return store.get();
  });

  // Settings Save
  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, prefs: Partial<Preferences>) => {
    store.set(prefs);
    // 立即生效的偏好：防截屏。其余偏好在下一次会话开始时读取。
    if (typeof prefs.hideFromScreenShare === 'boolean') {
      pillWindow.setHideFromCapture(prefs.hideFromScreenShare);
    }
  });

  // Upload Resume（真实 PDF 解析）
  ipcMain.handle(IPC.SETTINGS_UPLOAD_RESUME, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择简历',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return null;

    const filePath = filePaths[0];
    const fileName = path.basename(filePath);
    try {
      const text = await parseResumePDF(filePath);
      if (!text.trim()) {
        return { error: 'PDF 里没有可提取的文本（可能是扫描件）' };
      }
      store.set({ resumeFileName: fileName, resumeText: text });
      return { fileName, text };
    } catch (error) {
      console.error('Error parsing resume:', error);
      return { error: `解析失败：${error instanceof Error ? error.message : error}` };
    }
  });

  // Clear Resume
  ipcMain.handle(IPC.SETTINGS_CLEAR_RESUME, () => {
    store.set({ resumeFileName: '', resumeText: '' });
  });
}
