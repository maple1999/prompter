import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { PreferencesStore } from './storage/preferences';
import { PillWindow } from './windows/pill-window';
import { SettingsWindow } from './windows/settings-window';
import { RegionPicker } from './windows/region-picker';
import { TrayManager } from './tray';
import { HotkeyManager } from './hotkeys';
import { registerIpcHandlers } from './ipc-handlers';
import { IPC, IslandState, SessionMode } from '../shared/types';
import { AudioCaptureService } from './audio/capture-service';
import { MeetingCoordinator } from './coordinators/meeting';
import { InterviewCoordinator } from './coordinators/interview';
import { QuizCoordinator } from './coordinators/quiz';
import { InterviewTranscript } from './utils/transcript';

type AnyCoordinator = MeetingCoordinator | InterviewCoordinator | QuizCoordinator;

let store: PreferencesStore;
let pillWindow: PillWindow;
let settingsWindow: SettingsWindow;
let trayManager: TrayManager;
let hotkeys: HotkeyManager;
let capture: AudioCaptureService;
let regionPicker: RegionPicker;

let activeCoordinator: AnyCoordinator | null = null;
let currentMode: SessionMode = 'meeting';
/** 最近一次面试会话的记录，停止后仍可导出 */
let lastInterviewTranscript: InterviewTranscript | null = null;

/** 停掉当前协调器。所有会「换协调器」的入口都必须先走这里，避免孤儿协调器继续采音/写状态。 */
function stopCurrent() {
  activeCoordinator?.stop();
  activeCoordinator = null;
}

/**
 * 给协调器发的状态回调带上「所有权」守卫：
 * 协调器被替换后，它遗留的异步回调（LLM 流、错误自动收回定时器等）不再能碰药丸状态。
 */
function makeStateSink(owner: () => AnyCoordinator | null): (state: IslandState) => void {
  return (state: IslandState) => {
    if (activeCoordinator === owner()) {
      pillWindow.updateState(state);
    }
  };
}

async function startSession() {
  stopCurrent();
  const prefs = store.get();

  if (currentMode === 'meeting') {
    let coord: MeetingCoordinator;
    coord = new MeetingCoordinator(prefs, makeStateSink(() => coord), capture);
    activeCoordinator = coord;
    await coord.start();
  } else if (currentMode === 'interview') {
    let coord: InterviewCoordinator;
    coord = new InterviewCoordinator(prefs, makeStateSink(() => coord), capture);
    activeCoordinator = coord;
    lastInterviewTranscript = coord.getTranscript();
    await coord.start();
  } else {
    // 笔试模式：点「开始」= 立即截屏答题（对应 macOS 选择笔试模式后点开始）
    await startQuizCapture();
  }
}

/** 创建（或复用）笔试协调器并触发一次截屏答题。 */
async function startQuizCapture() {
  if (!(activeCoordinator instanceof QuizCoordinator)) {
    stopCurrent();
    let coord: QuizCoordinator;
    coord = new QuizCoordinator(store.get(), makeStateSink(() => coord), regionPicker);
    activeCoordinator = coord;
  }
  await (activeCoordinator as QuizCoordinator).captureAndSolve();
}

function exportTranscript() {
  const transcript = lastInterviewTranscript;
  if (!transcript || transcript.isEmpty) {
    dialog.showMessageBox({
      type: 'info',
      message: '暂无面试记录',
      detail: '面试模式下完成至少一轮问答后才有可导出的记录。',
    });
    return;
  }

  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('') + '-' + [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');

  dialog
    .showSaveDialog({
      title: '导出面试记录',
      defaultPath: path.join(app.getPath('documents'), `面试记录-${stamp}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    .then(({ canceled, filePath }) => {
      if (canceled || !filePath) return;
      fs.writeFileSync(filePath, transcript.exportMarkdown(), 'utf-8');
    })
    .catch((err) => console.error('[Export] 保存失败:', err));
}

app.whenReady().then(() => {
  store = new PreferencesStore();
  const preloadPath = path.join(__dirname, '../preload/preload.js');

  pillWindow = new PillWindow(preloadPath);
  settingsWindow = new SettingsWindow(preloadPath);
  trayManager = new TrayManager();
  hotkeys = new HotkeyManager();
  capture = new AudioCaptureService(preloadPath);
  regionPicker = new RegionPicker(preloadPath);

  registerIpcHandlers(store, pillWindow);

  const failedHotkeys = hotkeys.register();
  if (failedHotkeys.length > 0) {
    trayManager.setToolTip(`OpenTeleprompter（快捷键被占用: ${failedHotkeys.join(', ')}）`);
  }

  pillWindow.updateState({ type: 'compact' });
  pillWindow.setMode(currentMode);
  pillWindow.setHideFromCapture(store.get().hideFromScreenShare);

  // ── 托盘事件 ──
  trayManager.on(IPC.SESSION_START, () => {
    void startSession();
  });

  trayManager.on(IPC.SESSION_STOP, () => {
    stopCurrent();
    pillWindow.updateState({ type: 'compact' });
  });

  trayManager.on(IPC.SESSION_MODE_CHANGE, (mode: SessionMode) => {
    currentMode = mode;
    trayManager.setMode(mode);
    pillWindow.setMode(mode);
    stopCurrent();
    pillWindow.updateState({ type: 'compact' });
  });

  trayManager.on(IPC.EXPORT_TRANSCRIPT, () => {
    exportTranscript();
  });

  trayManager.on(IPC.TOGGLE_PILL, () => {
    pillWindow.toggle();
  });

  trayManager.on(IPC.OPEN_SETTINGS, () => {
    settingsWindow.show();
  });

  // ── 全局快捷键 ──
  hotkeys.on('hotkey:toggle-pill', () => {
    pillWindow.toggle();
  });

  hotkeys.on('hotkey:finalize-question', () => {
    if (activeCoordinator instanceof InterviewCoordinator) {
      activeCoordinator.finalizeQuestion();
    }
  });

  hotkeys.on('hotkey:capture-quiz', () => {
    // 任何模式下按快捷键都切到笔试并截屏；startQuizCapture 内部会先 stopCurrent
    if (currentMode !== 'quiz') {
      currentMode = 'quiz';
      trayManager.setMode('quiz');
      pillWindow.setMode('quiz');
    }
    void startQuizCapture();
  });
});

app.on('window-all-closed', () => {
  // 托盘应用：窗口关闭不退出
});

app.on('will-quit', () => {
  stopCurrent();
  hotkeys.unregisterAll();
  capture.destroy();
});
