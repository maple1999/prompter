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
  script: document.getElementById('script'),
  quizSystemPrompt: document.getElementById('quizSystemPrompt'),
};

// Resume elements
const uploadResumeBtn = document.getElementById('uploadResumeBtn');
const clearResumeBtn = document.getElementById('clearResumeBtn');
const resumeFileName = document.getElementById('resumeFileName');
const resumePreviewGroup = document.getElementById('resumePreviewGroup');
const resumePreview = document.getElementById('resumePreview');

// ── Tab Switching ──
navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const tabId = item.getAttribute('data-tab');

    // Update nav active state
    navItems.forEach((n) => n.classList.remove('active'));
    item.classList.add('active');

    // Update panel visibility
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
    maxTokens: parseInt(fields.maxTokens.value, 10) || 1024,
    temperature: parseFloat(fields.temperature.value) || 0.7,
    systemPrompt: fields.systemPrompt.value,
    language: languageRadio ? languageRadio.value : 'zh-CN',
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
  fields.maxTokens.value = prefs.maxTokens || 1024;
  fields.temperature.value = prefs.temperature ?? 0.7;
  fields.temperatureValue.textContent = (prefs.temperature ?? 0.7).toFixed(1);
  fields.systemPrompt.value = prefs.systemPrompt || '';
  fields.script.value = prefs.script || '';
  fields.quizSystemPrompt.value = prefs.quizSystemPrompt || '';

  // Language radio
  const langRadio = document.querySelector(`input[name="language"][value="${prefs.language || 'zh-CN'}"]`);
  if (langRadio) langRadio.checked = true;

  // Screenshot mode radio
  const modeRadio = document.querySelector(`input[name="quizScreenshotMode"][value="${prefs.quizScreenshotMode || 'fullscreen'}"]`);
  if (modeRadio) modeRadio.checked = true;

  // Resume
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

// ── Auto-save on Change (debounced) ──
const debouncedSave = debounce(() => {
  const prefs = collectPreferences();
  if (window.electronAPI && window.electronAPI.savePreferences) {
    window.electronAPI.savePreferences(prefs);
  }
}, 500);

// Attach change listeners to all form inputs
function attachChangeListeners() {
  // Text inputs and textareas
  const inputs = document.querySelectorAll('.form-input, .form-textarea');
  inputs.forEach((input) => {
    input.addEventListener('input', debouncedSave);
  });

  // Temperature slider — also update displayed value
  fields.temperature.addEventListener('input', () => {
    fields.temperatureValue.textContent = parseFloat(fields.temperature.value).toFixed(1);
    debouncedSave();
  });

  // Radio buttons
  const radios = document.querySelectorAll('input[type="radio"]');
  radios.forEach((radio) => {
    radio.addEventListener('change', debouncedSave);
  });
}

// ── Resume Upload ──
uploadResumeBtn.addEventListener('click', async () => {
  if (window.electronAPI && window.electronAPI.uploadResume) {
    const result = await window.electronAPI.uploadResume();
    if (result && result.fileName) {
      updateResumeDisplay(result.fileName, result.text || '');
    }
  }
});

// ── Resume Clear ──
clearResumeBtn.addEventListener('click', async () => {
  if (window.electronAPI && window.electronAPI.clearResume) {
    await window.electronAPI.clearResume();
  }
  updateResumeDisplay('', '');
});

// ── Initialization ──
async function init() {
  attachChangeListeners();

  // Load saved preferences
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
