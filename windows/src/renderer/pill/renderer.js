// ──────────────────────────────────────────
// OpenTeleprompter — Pill Renderer
// Handles state updates from main process
// and renders the appropriate pill UI
// ──────────────────────────────────────────

const pill = document.getElementById('pill');

/** Current session mode, updated via state */
let currentMode = 'meeting';

/** Mode display configuration */
const MODE_CONFIG = {
  meeting: { icon: '📋', label: '会议模式' },
  interview: { icon: '🎤', label: '面试模式' },
  quiz: { icon: '📝', label: '笔试模式' },
};

// ── State Renderers ──

/**
 * Render the compact idle state with mode indicator.
 * @param {string} mode - 'meeting' | 'interview' | 'quiz'
 */
function renderCompact(mode) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.meeting;
  currentMode = mode;

  pill.setAttribute('data-state', 'compact');
  pill.setAttribute('data-mode', mode);
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

/**
 * Render the thinking state with animated dots.
 */
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

    // Apply status class
    const status = statuses[i] || 'unread';
    span.classList.add(status);

    // Highlight cursor position
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

/**
 * Render hidden state.
 */
function renderHidden() {
  pill.setAttribute('data-state', 'hidden');
  pill.removeAttribute('data-mode');
  pill.classList.remove('has-text');
}

// ── State Router ──

/**
 * Handle incoming state update from main process.
 * @param {Object} state - IslandState object with `type` and optional fields
 */
function handleStateUpdate(state) {
  if (!state || !state.type) return;

  switch (state.type) {
    case 'hidden':
      renderHidden();
      break;

    case 'compact':
      renderCompact(state.mode || currentMode);
      break;

    case 'expanded':
      // Expanded uses same visual as compact but could be extended
      renderCompact(state.mode || currentMode);
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

    case 'error':
      renderError(state.message || '');
      break;

    default:
      console.warn('[Pill] Unknown state type:', state.type);
  }
}

// ── IPC Listener ──

if (window.electronAPI && window.electronAPI.onStateUpdate) {
  window.electronAPI.onStateUpdate(handleStateUpdate);
}

// Initialize to compact state
renderCompact(currentMode);
