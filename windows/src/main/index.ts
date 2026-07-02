import { app } from 'electron';
import * as path from 'path';
import { PreferencesStore } from './storage/preferences';
import { PillWindow } from './windows/pill-window';
import { SettingsWindow } from './windows/settings-window';
import { TrayManager } from './tray';
import { HotkeyManager } from './hotkeys';
import { registerIpcHandlers } from './ipc-handlers';
import { IPC, IslandState, SessionMode } from '../shared/types';
import { MeetingCoordinator } from './coordinators/meeting';
import { InterviewCoordinator } from './coordinators/interview';
import { QuizCoordinator } from './coordinators/quiz';

let store: PreferencesStore;
let pillWindow: PillWindow;
let settingsWindow: SettingsWindow;
let trayManager: TrayManager;
let hotkeys: HotkeyManager;

let activeCoordinator: MeetingCoordinator | InterviewCoordinator | QuizCoordinator | null = null;
let currentMode: SessionMode = 'meeting';

// App state
let currentIslandState: IslandState = { type: 'compact' };

app.whenReady().then(() => {
  store = new PreferencesStore();
  const preloadPath = path.join(__dirname, '../preload/preload.js');

  pillWindow = new PillWindow(preloadPath);
  settingsWindow = new SettingsWindow(preloadPath);
  trayManager = new TrayManager();
  hotkeys = new HotkeyManager();

  // Register IPC handlers
  registerIpcHandlers(store, pillWindow, settingsWindow);

  // Register Global Shortcuts
  hotkeys.register();

  // Initial state
  pillWindow.updateState(currentIslandState);

  // Hide from screen share if preference is set
  pillWindow.setHideFromCapture(store.get().hideFromScreenShare);

  // Tray Events
  trayManager.on(IPC.SESSION_START, async () => {
    if (activeCoordinator) {
      if ('stop' in activeCoordinator) (activeCoordinator as any).stop();
      activeCoordinator = null;
    }

    const prefs = store.get();
    const updateState = (state: IslandState) => pillWindow.updateState(state);

    if (currentMode === 'meeting') {
      activeCoordinator = new MeetingCoordinator(prefs, updateState);
      await (activeCoordinator as MeetingCoordinator).start();
    } else if (currentMode === 'interview') {
      activeCoordinator = new InterviewCoordinator(prefs, updateState);
      await (activeCoordinator as InterviewCoordinator).start();
    } else if (currentMode === 'quiz') {
      activeCoordinator = new QuizCoordinator(prefs, updateState);
      // Quiz starts via hotkey
    }
  });

  trayManager.on(IPC.SESSION_STOP, () => {
    if (activeCoordinator && 'stop' in activeCoordinator) {
      (activeCoordinator as any).stop();
    }
    activeCoordinator = null;
    currentIslandState = { type: 'compact' };
    pillWindow.updateState(currentIslandState);
  });

  trayManager.on(IPC.SESSION_MODE_CHANGE, (mode: SessionMode) => {
    currentMode = mode;
    trayManager.setMode(mode);
    if (activeCoordinator && 'stop' in activeCoordinator) {
      (activeCoordinator as any).stop();
    }
    activeCoordinator = null;
    currentIslandState = { type: 'compact' };
    pillWindow.updateState(currentIslandState);
  });

  trayManager.on(IPC.TOGGLE_PILL, () => {
    pillWindow.toggle();
  });

  trayManager.on(IPC.OPEN_SETTINGS, () => {
    settingsWindow.show();
  });

  // Hotkey Events
  hotkeys.on('hotkey:toggle-pill', () => {
    pillWindow.toggle();
  });

  hotkeys.on('hotkey:finalize-question', () => {
    if (currentMode === 'interview' && activeCoordinator) {
      (activeCoordinator as InterviewCoordinator).finalizeQuestion();
    }
  });

  hotkeys.on('hotkey:capture-quiz', () => {
    if (currentMode === 'quiz' && activeCoordinator) {
      (activeCoordinator as QuizCoordinator).captureAndSolve();
    } else if (currentMode !== 'quiz') {
      // Auto-switch to quiz mode and capture if not already
      currentMode = 'quiz';
      trayManager.setMode('quiz');
      activeCoordinator = new QuizCoordinator(store.get(), (state) => pillWindow.updateState(state));
      (activeCoordinator as QuizCoordinator).captureAndSolve();
    }
  });
});

app.on('window-all-closed', () => {
  // Do nothing. This is a tray app, we don't quit when windows close.
});

app.on('will-quit', () => {
  hotkeys.unregisterAll();
});
