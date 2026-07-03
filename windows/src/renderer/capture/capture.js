// ──────────────────────────────────────────
// OpenTeleprompter — 隐藏音频采集页
//
// 主进程通过 capture:command 控制：
//   { action: 'start', source: 'mic' | 'system' } / { action: 'stop' }
//
// 输出：16 kHz mono Float32 PCM，经 captureAPI.sendPcm 送回主进程。
// 系统音频用 chromeMediaSource: 'desktop'（Windows 上是 WASAPI loopback，
// 不需要用户手势，也不弹权限框）。
// ──────────────────────────────────────────

let mediaStream = null;
let audioContext = null;
let processor = null;

async function cleanup() {
  if (processor) {
    try { processor.disconnect(); } catch (_) {}
    processor.onaudioprocess = null;
    processor = null;
  }
  if (audioContext) {
    try { await audioContext.close(); } catch (_) {}
    audioContext = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      try { track.stop(); } catch (_) {}
    }
    mediaStream = null;
  }
}

async function start(source) {
  await cleanup();

  if (source === 'mic') {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } else {
    // 系统音频 loopback。Chromium 要求 desktop audio 必须同时请求 video，拿到后立即停掉。
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'desktop' } },
      video: { mandatory: { chromeMediaSource: 'desktop' } },
    });
    for (const track of mediaStream.getVideoTracks()) {
      track.stop();
      mediaStream.removeTrack(track);
    }
  }

  // 直接以 16 kHz 建 AudioContext，Chromium 内部完成重采样
  audioContext = new AudioContext({ sampleRate: 16000 });
  const sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    // 必须拷贝：inputBuffer 会被复用
    window.captureAPI.sendPcm(new Float32Array(input));
  };

  // ScriptProcessor 需要接到 destination 才会触发回调；用零增益节点静音
  const mute = audioContext.createGain();
  mute.gain.value = 0;
  sourceNode.connect(processor);
  processor.connect(mute);
  mute.connect(audioContext.destination);
}

window.captureAPI.onCommand(async (cmd) => {
  try {
    if (cmd.action === 'start') {
      await start(cmd.source);
      window.captureAPI.sendStarted();
    } else if (cmd.action === 'stop') {
      await cleanup();
    }
  } catch (err) {
    await cleanup();
    window.captureAPI.sendError(String(err && err.message ? err.message : err));
  }
});
