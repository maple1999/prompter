// ──────────────────────────────────────────
// 交互选区：主进程发来全屏截图，用户拖框后回传 CSS 像素矩形。
// ESC 取消 → done(null)。
// ──────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let screenshot = null; // Image
let dragStart = null;  // {x, y}
let dragCurrent = null;
let done = false;

function resize() {
  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  draw();
}

function currentRect() {
  if (!dragStart || !dragCurrent) return null;
  const x = Math.min(dragStart.x, dragCurrent.x);
  const y = Math.min(dragStart.y, dragCurrent.y);
  const width = Math.abs(dragCurrent.x - dragStart.x);
  const height = Math.abs(dragCurrent.y - dragStart.y);
  return { x, y, width, height };
}

function draw() {
  if (!screenshot) return;
  const dpr = window.devicePixelRatio;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 背景：截图 + 半透明遮罩
  ctx.drawImage(screenshot, 0, 0, window.innerWidth, window.innerHeight);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // 选区：还原亮度 + 边框
  const rect = currentRect();
  if (rect && rect.width > 0 && rect.height > 0) {
    ctx.drawImage(
      screenshot,
      rect.x * (screenshot.naturalWidth / window.innerWidth),
      rect.y * (screenshot.naturalHeight / window.innerHeight),
      rect.width * (screenshot.naturalWidth / window.innerWidth),
      rect.height * (screenshot.naturalHeight / window.innerHeight),
      rect.x, rect.y, rect.width, rect.height
    );
    ctx.strokeStyle = 'rgba(102, 179, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  }
}

window.addEventListener('resize', resize);

window.addEventListener('mousedown', (e) => {
  dragStart = { x: e.clientX, y: e.clientY };
  dragCurrent = { x: e.clientX, y: e.clientY };
  draw();
});

window.addEventListener('mousemove', (e) => {
  if (!dragStart) return;
  dragCurrent = { x: e.clientX, y: e.clientY };
  draw();
});

window.addEventListener('mouseup', (e) => {
  if (!dragStart || done) return;
  dragCurrent = { x: e.clientX, y: e.clientY };
  const rect = currentRect();
  done = true;
  window.regionAPI.done(rect && rect.width >= 4 && rect.height >= 4 ? rect : null);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !done) {
    done = true;
    window.regionAPI.done(null);
  }
});

window.regionAPI.onInit(({ dataURL }) => {
  const img = new Image();
  img.onload = () => {
    screenshot = img;
    resize();
  };
  img.src = dataURL;
});
