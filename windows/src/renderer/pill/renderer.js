// ──────────────────────────────────────────
// OpenTeleprompter — Pill Renderer
// Handles state updates from main process
// and renders the appropriate pill UI
// ──────────────────────────────────────────

const pill = document.getElementById('pill');

/** Current session mode, pushed from main via pill:mode-update */
let currentMode = 'meeting';

/** Mode display configuration */
const MODE_CONFIG = {
  meeting: { icon: '📋', label: '会议模式' },
  interview: { icon: '🎤', label: '面试模式' },
  quiz: { icon: '📝', label: '笔试模式' },
};

const KIND_LABELS = {
  choice: '选择题',
  fill: '填空题',
  coding: '编程题',
};

// ── State Renderers ──

function renderCompact() {
  const config = MODE_CONFIG[currentMode] || MODE_CONFIG.meeting;

  pill.setAttribute('data-state', 'compact');
  pill.setAttribute('data-mode', currentMode);
  pill.classList.remove('has-text');

  const section = pill.querySelector('.pill-compact');
  section.querySelector('.mode-icon').textContent = config.icon;
  section.querySelector('.mode-label').textContent = config.label;
}

/**
 * Render the listening state with waveform and optional transcript.
 * @param {string} transcript - live transcript text
 */
function renderListening(transcript) {
  pill.setAttribute('data-state', 'listening');
  pill.removeAttribute('data-mode');

  const hasText = transcript && transcript.trim().length > 0;
  pill.classList.toggle('has-text', hasText);

  const section = pill.querySelector('.pill-listening');
  const textEl = section.querySelector('.listening-text');
  textEl.textContent = hasText ? transcript : '';
}

function renderThinking() {
  pill.setAttribute('data-state', 'thinking');
  pill.removeAttribute('data-mode');
  pill.classList.remove('has-text');
}

/**
 * Render the teleprompter state with colored tokens.
 * @param {Object} payload - { tokens, displayTokens, statuses, cursor }
 */
function renderTeleprompter(payload) {
  const { displayTokens, statuses, cursor } = payload;

  pill.setAttribute('data-state', 'teleprompter');
  pill.removeAttribute('data-mode');
  pill.classList.remove('has-text');

  const container = pill.querySelector('.teleprompter-tokens');
  container.innerHTML = '';

  // Determine if content fits single line (heuristic: < 60 chars total)
  const totalLength = displayTokens.reduce((sum, t) => sum + t.length, 0);
  const isSingleLine = totalLength < 60;
  container.classList.toggle('single-line', isSingleLine);

  displayTokens.forEach((token, i) => {
    const span = document.createElement('span');
    span.className = 'token';
    span.textContent = token;

    const status = statuses[i] || 'unread';
    span.classList.add(status);

    // cursor === displayTokens.length 表示已读完，不高亮任何 token
    if (i === cursor) {
      span.classList.add('cursor');
    }

    container.appendChild(span);
  });

  // Auto-scroll to cursor in single-line mode
  if (isSingleLine) {
    const cursorEl = container.querySelector('.token.cursor');
    if (cursorEl) {
      cursorEl.scrollIntoView({ inline: 'center', behavior: 'smooth' });
    }
  }
}

/**
 * Render the quiz answer state (mirrors macOS QuizAnswerView):
 * big answer (or ✓ 已复制 for coding), small reasoning below.
 * @param {Object} payload - { kind, answer, reasoning, language, codeCopied }
 */
function renderQuizAnswer(payload) {
  pill.setAttribute('data-state', 'quiz-answer');
  pill.removeAttribute('data-mode');
  pill.classList.remove('has-text');

  const section = pill.querySelector('.pill-quiz');
  const kindEl = section.querySelector('.quiz-kind');
  const answerEl = section.querySelector('.quiz-answer');
  const reasoningEl = section.querySelector('.quiz-reasoning');

  let kindText = KIND_LABELS[payload.kind] || payload.kind;
  if (payload.kind === 'coding' && payload.language) {
    kindText += ` · ${payload.language}`;
  }
  kindEl.textContent = kindText;

  if (payload.codeCopied) {
    answerEl.textContent = '✓ 已复制到剪贴板';
    answerEl.classList.add('copied');
  } else {
    answerEl.textContent = payload.answer || '—';
    answerEl.classList.remove('copied');
  }

  reasoningEl.textContent = payload.reasoning || '';
}

/**
 * Render the error state.
 * @param {string} message - error message text
 */
function renderError(message) {
  pill.setAttribute('data-state', 'error');
  pill.removeAttribute('data-mode');
  pill.classList.remove('has-text');

  const section = pill.querySelector('.pill-error');
  section.querySelector('.error-message').textContent = message || '发生未知错误';
}

function renderHidden() {
  pill.setAttribute('data-state', 'hidden');
  pill.removeAttribute('data-mode');
  pill.classList.remove('has-text');
}

// ── State Router ──

function handleStateUpdate(state) {
  if (!state || !state.type) return;

  switch (state.type) {
    case 'hidden':
      renderHidden();
      break;

    case 'compact':
    case 'expanded':
      renderCompact();
      break;

    case 'listening':
      renderListening(state.transcript || '');
      break;

    case 'thinking':
      renderThinking();
      break;

    case 'teleprompter':
      if (state.payload) {
        renderTeleprompter(state.payload);
      }
      break;

    case 'quiz-answer':
      if (state.payload) {
        renderQuizAnswer(state.payload);
      }
      break;

    case 'error':
      renderError(state.message || '');
      break;

    default:
      console.warn('[Pill] Unknown state type:', state.type);
  }
}

// ── IPC Listeners ──

if (window.electronAPI) {
  if (window.electronAPI.onStateUpdate) {
    window.electronAPI.onStateUpdate(handleStateUpdate);
  }
  if (window.electronAPI.onModeUpdate) {
    window.electronAPI.onModeUpdate((mode) => {
      currentMode = mode;
      // 只有 compact 态显示模式指示，其他状态下模式变化会伴随状态更新
      if (pill.getAttribute('data-state') === 'compact') {
        renderCompact();
      }
    });
  }
}

// Initialize to compact state
renderCompact();
