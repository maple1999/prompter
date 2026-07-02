import { ipcMain, dialog } from 'electron';
import { IPC, Preferences } from '../../shared/types';
import { PreferencesStore } from './storage/preferences';
import { PillWindow } from './windows/pill-window';
import { SettingsWindow } from './windows/settings-window';
import * as path from 'path';
// import { parseResumePDF } from './resume/parser';

export function registerIpcHandlers(
  store: PreferencesStore,
  pillWindow: PillWindow,
  settingsWindow: SettingsWindow
) {
  // Settings Load
  ipcMain.handle(IPC.SETTINGS_LOAD, () => {
    return store.get();
  });

  // Settings Save
  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, prefs: Partial<Preferences>) => {
    store.set(prefs);
    // TODO: Notify active coordinators of config change
  });

  // Upload Resume
  ipcMain.handle(IPC.SETTINGS_UPLOAD_RESUME, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择简历',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return null;

    try {
      // Stub for PDF parsing
      const filePath = filePaths[0];
      const fileName = path.basename(filePath);
      
      // We will implement actual parsing later, for now just a stub text
      // const text = await parseResumePDF(filePath);
      const text = `Extracted text from ${fileName}...\n\nExperience:\nSoftware Engineer`;
      
      store.set({ resumeFileName: fileName, resumeText: text });
      
      return { fileName, text };
    } catch (error) {
      console.error('Error parsing resume:', error);
      return null;
    }
  });

  // Clear Resume
  ipcMain.handle(IPC.SETTINGS_CLEAR_RESUME, () => {
    store.set({ resumeFileName: '', resumeText: '' });
  });
}
