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
  | { type: 'quiz-answer'; payload: QuizAnswerPayload }
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

/** 笔试答案（对齐 macOS QuizAnswerPayload） */
export interface QuizAnswerPayload {
  kind: 'choice' | 'fill' | 'coding';
  answer: string;
  reasoning: string;
  /** 编程题语言，如 "python" */
  language?: string;
  /** 编程题代码已写入剪贴板，UI 显示 "✓ 已复制" */
  codeCopied?: boolean;
}

/** 面试记录条目 */
export interface TranscriptEntry {
  question: string;
  answer: string;
  timestamp: number; // Date.now()
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
  // 语音识别（OpenAI 兼容 /v1/audio/transcriptions）
  language: 'zh-CN' | 'en-US';
  /** 留空则复用 LLM 的 baseURL */
  asrBaseURL: string;
  /** 留空则复用 LLM 的 apiKey */
  asrApiKey: string;
  asrModel: string;
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

/** 偏好设置默认值（对齐 macOS Preferences 默认值） */
export const DEFAULT_PREFERENCES: Preferences = {
  baseURL: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-4o-mini',
  systemPrompt: [
    '你是正在参加面试的候选人。听到面试官的问题后，用第一人称、口语化、流畅自然的语气直接回答。',
    '',
    '- 不重复问题、不寒暄；不要用 markdown / 列表 / 编号——你说的话会被人念出来。',
    '- 用短句，控制在 200~300 字，最多两段。',
    '- 行为或经历类问题给出具体的项目、动作和数字，避免泛泛而谈。',
    '- 技术问题先给出关键判断或选型，再用一两句解释为什么。',
    '- 问题模糊时按最常见解读回答，不反问。',
  ].join('\n'),
  maxTokens: 500,
  temperature: 0.7,
  language: 'zh-CN',
  asrBaseURL: '',
  asrApiKey: '',
  asrModel: 'whisper-1',
  interviewVADSilence: 2.8,
  script: '',
  autoHideSeconds: 10,
  teleprompterLines: 2,
  hideFromScreenShare: true,
  quizSystemPrompt: [
    '你是笔试助手。看图后严格按这个 JSON 格式回复，不要 markdown 包裹：',
    '{"kind":"choice|fill|coding","answer":"...","language":"...","reasoning":"..."}',
    '',
    '- 选择题：answer 填字母如 "B"，reasoning ≤80 字',
    '- 填空题：answer 填最终值，reasoning ≤80 字',
    '- 编程题：answer 填完整可运行代码（含换行），language 填 "python"/"swift"/"go" 等，reasoning 含算法名 + 复杂度 + 关键点 ≤100 字',
    '- 不要复述题目，不要客套',
  ].join('\n'),
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
  PILL_MODE_UPDATE: 'pill:mode-update',

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

  // Main ↔ hidden audio capture window
  CAPTURE_COMMAND: 'capture:command',
  CAPTURE_PCM: 'capture:pcm',
  CAPTURE_ERROR: 'capture:error',
  CAPTURE_STARTED: 'capture:started',

  // Main ↔ region picker window
  REGION_INIT: 'region:init',
  REGION_DONE: 'region:done',
} as const;

/** Token 归一化结果 */
export interface NormalizedToken {
  normalized: string; // 用于匹配的归一化文本
  display: string;    // 用于显示的原始文本
}

/** 语音识别更新（text 是累积文本，与 macOS SFSpeech partial 语义一致） */
export interface TranscriptionUpdate {
  text: string;
  isFinal: boolean;
}
