// ──────────────────────────────────────────
// OpenTeleprompter — Settings Renderer
// Tab switching, preference load/save,
// resume upload/clear
// ──────────────────────────────────────────

// ── Debounce Utility ──
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ── DOM References ──
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');

// Form fields
const fields = {
  baseURL: document.getElementById('baseURL'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  maxTokens: document.getElementById('maxTokens'),
  temperature: document.getElementById('temperature'),
  temperatureValue: document.getElementById('temperatureValue'),
  systemPrompt: document.getElementById('systemPrompt'),
  asrModel: document.getElementById('asrModel'),
  asrBaseURL: document.getElementById('asrBaseURL'),
  asrApiKey: document.getElementById('asrApiKey'),
  interviewVADSilence: document.getElementById('interviewVADSilence'),
  interviewVADSilenceValue: document.getElementById('interviewVADSilenceValue'),
  autoHideSeconds: document.getElementById('autoHideSeconds'),
  teleprompterLines: document.getElementById('teleprompterLines'),
  hideFromScreenShare: document.getElementById('hideFromScreenShare'),
  script: document.getElementById('script'),
  quizSystemPrompt: document.getElementById('quizSystemPrompt'),
};

// Resume elements
const uploadResumeBtn = document.getElementById('uploadResumeBtn');
const clearResumeBtn = document.getElementById('clearResumeBtn');
const resumeFileName = document.getElementById('resumeFileName');
const resumePreviewGroup = document.getElementById('resumePreviewGroup');
const resumePreview = document.getElementById('resumePreview');
const resumeError = document.getElementById('resumeError');

// ── Tab Switching ──
navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const tabId = item.getAttribute('data-tab');

    navItems.forEach((n) => n.classList.remove('active'));
    item.classList.add('active');

    tabPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${tabId}`);
    });
  });
});

// ── Collect Preferences from Form ──
function collectPreferences() {
  const languageRadio = document.querySelector('input[name="language"]:checked');
  const screenshotRadio = document.querySelector('input[name="quizScreenshotMode"]:checked');

  return {
    baseURL: fields.baseURL.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    model: fields.model.value.trim(),
    maxTokens: parseInt(fields.maxTokens.value, 10) || 500,
    temperature: parseFloat(fields.temperature.value) || 0.7,
    systemPrompt: fields.systemPrompt.value,
    language: languageRadio ? languageRadio.value : 'zh-CN',
    asrModel: fields.asrModel.value.trim() || 'whisper-1',
    asrBaseURL: fields.asrBaseURL.value.trim(),
    asrApiKey: fields.asrApiKey.value.trim(),
    interviewVADSilence: parseFloat(fields.interviewVADSilence.value) || 2.8,
    autoHideSeconds: parseInt(fields.autoHideSeconds.value, 10) || 10,
    teleprompterLines: Math.max(1, Math.min(3, parseInt(fields.teleprompterLines.value, 10) || 2)),
    hideFromScreenShare: fields.hideFromScreenShare.checked,
    script: fields.script.value,
    quizSystemPrompt: fields.quizSystemPrompt.value,
    quizScreenshotMode: screenshotRadio ? screenshotRadio.value : 'fullscreen',
  };
}

// ── Populate Form from Preferences ──
function populateForm(prefs) {
  if (!prefs) return;

  fields.baseURL.value = prefs.baseURL || '';
  fields.apiKey.value = prefs.apiKey || '';
  fields.model.value = prefs.model || '';
  fields.maxTokens.value = prefs.maxTokens || 500;
  fields.temperature.value = prefs.temperature ?? 0.7;
  fields.temperatureValue.textContent = (prefs.temperature ?? 0.7).toFixed(1);
  fields.systemPrompt.value = prefs.systemPrompt || '';
  fields.asrModel.value = prefs.asrModel || 'whisper-1';
  fields.asrBaseURL.value = prefs.asrBaseURL || '';
  fields.asrApiKey.value = prefs.asrApiKey || '';
  fields.interviewVADSilence.value = prefs.interviewVADSilence ?? 2.8;
  fields.interviewVADSilenceValue.textContent = `${(prefs.interviewVADSilence ?? 2.8).toFixed(1)}s`;
  fields.autoHideSeconds.value = prefs.autoHideSeconds ?? 10;
  fields.teleprompterLines.value = prefs.teleprompterLines ?? 2;
  fields.hideFromScreenShare.checked = prefs.hideFromScreenShare !== false;
  fields.script.value = prefs.script || '';
  fields.quizSystemPrompt.value = prefs.quizSystemPrompt || '';

  const langRadio = document.querySelector(`input[name="language"][value="${prefs.language || 'zh-CN'}"]`);
  if (langRadio) langRadio.checked = true;

  const modeRadio = document.querySelector(`input[name="quizScreenshotMode"][value="${prefs.quizScreenshotMode || 'fullscreen'}"]`);
  if (modeRadio) modeRadio.checked = true;

  updateResumeDisplay(prefs.resumeFileName || '', prefs.resumeText || '');
}

// ── Resume Display ──
function updateResumeDisplay(fileName, text) {
  const hasResume = fileName && fileName.length > 0;

  resumeFileName.textContent = hasResume ? fileName : '未选择文件';
  resumeFileName.classList.toggle('has-file', hasResume);
  clearResumeBtn.style.display = hasResume ? 'inline-flex' : 'none';

  if (hasResume && text) {
    resumePreviewGroup.style.display = 'block';
    resumePreview.value = text;
  } else {
    resumePreviewGroup.style.display = 'none';
    resumePreview.value = '';
  }
}

function showResumeError(message) {
  if (message) {
    resumeError.textContent = message;
    resumeError.style.display = 'block';
  } else {
    resumeError.textContent = '';
    resumeError.style.display = 'none';
  }
}

// ── Auto-save on Change (debounced) ──
const debouncedSave = debounce(() => {
  const prefs = collectPreferences();
  if (window.electronAPI && window.electronAPI.savePreferences) {
    window.electronAPI.savePreferences(prefs);
  }
}, 500);

// Attach change listeners to all form inputs
function attachChangeListeners() {
  const inputs = document.querySelectorAll('.form-input, .form-textarea');
  inputs.forEach((input) => {
    input.addEventListener('input', debouncedSave);
  });

  // Sliders — also update displayed value
  fields.temperature.addEventListener('input', () => {
    fields.temperatureValue.textContent = parseFloat(fields.temperature.value).toFixed(1);
    debouncedSave();
  });
  fields.interviewVADSilence.addEventListener('input', () => {
    fields.interviewVADSilenceValue.textContent = `${parseFloat(fields.interviewVADSilence.value).toFixed(1)}s`;
    debouncedSave();
  });

  // Radio buttons & checkboxes
  const toggles = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
  toggles.forEach((el) => {
    el.addEventListener('change', debouncedSave);
  });
}

// ── Resume Upload ──
uploadResumeBtn.addEventListener('click', async () => {
  if (!(window.electronAPI && window.electronAPI.uploadResume)) return;
  showResumeError('');
  const result = await window.electronAPI.uploadResume();
  if (!result) return; // 用户取消
  if (result.error) {
    showResumeError(result.error);
    return;
  }
  if (result.fileName) {
    updateResumeDisplay(result.fileName, result.text || '');
  }
});

// ── Resume Clear ──
clearResumeBtn.addEventListener('click', async () => {
  if (window.electronAPI && window.electronAPI.clearResume) {
    await window.electronAPI.clearResume();
  }
  showResumeError('');
  updateResumeDisplay('', '');
});

// ── Initialization ──
async function init() {
  attachChangeListeners();

  if (window.electronAPI && window.electronAPI.loadPreferences) {
    try {
      const prefs = await window.electronAPI.loadPreferences();
      populateForm(prefs);
    } catch (err) {
      console.error('[Settings] Failed to load preferences:', err);
    }
  }
}

init();
