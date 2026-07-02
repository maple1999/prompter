// ────────────────────────────────────────
// Shared type definitions for OpenTeleprompter Windows
// Mirrors macOS TeleprompterCore types
// ────────────────────────────────────────

/** 药丸浮窗的状态机 */
export type IslandState =
  | { type: 'hidden' }
  | { type: 'compact' }
  | { type: 'expanded' }
  | { type: 'listening'; transcript: string }
  | { type: 'thinking' }
  | { type: 'teleprompter'; payload: TeleprompterPayload }
  | { type: 'error'; message: string };

/** 提词器数据 */
export interface TeleprompterPayload {
  tokens: string[];
  displayTokens: string[];
  statuses: TokenStatus[];
  cursor: number;
}

export type TokenStatus = 'unread' | 'matched' | 'skipped';

/** 会话模式 */
export type SessionMode = 'meeting' | 'interview' | 'quiz';

/** 笔试答案 */
export interface QuizAnswerPayload {
  kind: 'choice' | 'fill' | 'coding';
  answer: string;
  reasoning: string;
  codeCopied?: boolean;
}

/** 面试记录条目 */
export interface TranscriptEntry {
  question: string;
  answer: string;
  timestamp: number; // Date.now()
}

/** LLM 配置 */
export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
}

/** 应用偏好设置 */
export interface Preferences {
  // LLM
  baseURL: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  // 语音
  language: 'zh-CN' | 'en-US';
  // 面试
  interviewVADSilence: number; // 秒
  // 会议
  script: string;
  // 提词器
  autoHideSeconds: number;
  teleprompterLines: number;
  hideFromScreenShare: boolean;
  // 笔试
  quizSystemPrompt: string;
  quizScreenshotMode: 'fullscreen' | 'interactive';
  // 简历
  resumeText: string;
  resumeFileName: string;
}

/** 偏好设置默认值 */
export const DEFAULT_PREFERENCES: Preferences = {
  baseURL: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-4o',
  systemPrompt: '你是一位经验丰富的面试辅助 AI。请用简洁的中文回答面试问题，突出关键要点。',
  maxTokens: 1024,
  temperature: 0.7,
  language: 'zh-CN',
  interviewVADSilence: 2.0,
  script: '',
  autoHideSeconds: 5,
  teleprompterLines: 2,
  hideFromScreenShare: true,
  quizSystemPrompt: '',
  quizScreenshotMode: 'fullscreen',
  resumeText: '',
  resumeFileName: '',
};

// ────────────────────────────────────────
// IPC 通道常量
// ────────────────────────────────────────

export const IPC = {
  // Main → Pill Renderer
  PILL_STATE_UPDATE: 'pill:state-update',

  // Main ↔ Settings Renderer
  SETTINGS_LOAD: 'settings:load',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_UPLOAD_RESUME: 'settings:upload-resume',
  SETTINGS_CLEAR_RESUME: 'settings:clear-resume',
  SETTINGS_RESUME_RESULT: 'settings:resume-result',

  // Session control (from tray/hotkeys → main)
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_MODE_CHANGE: 'session:mode-change',
  EXPORT_TRANSCRIPT: 'session:export-transcript',

  // Window control
  TOGGLE_PILL: 'window:toggle-pill',
  OPEN_SETTINGS: 'window:open-settings',
} as const;

/** Token 归一化结果 */
export interface NormalizedToken {
  normalized: string; // 用于匹配的归一化文本
  display: string;    // 用于显示的原始文本
}

/** 语音识别更新 */
export interface TranscriptionUpdate {
  text: string;       // 累积的识别文本
  isFinal: boolean;
}
