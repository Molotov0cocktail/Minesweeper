// 地雷矢量图元：八向短刺与石墨色金属球，按逻辑像素绘制，无 DOM / 图片依赖。
const TAU = Math.PI * 2;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 格子左上角
 * @param {number} y 格子左上角
 * @param {number} size 格子边长
 * @param {{color?:string, highlight?:string, lost?:boolean, danger?:string}} opts
 */
export function drawMineGlyph(ctx, x, y, size, opts = {}) {
  if (![x, y, size].every(Number.isFinite) || size <= 0) return;
  const color = opts.color ?? '#26384d';
  const highlight = opts.highlight ?? '#eef5ff';
  const cx = x + size * 0.5;
  const cy = y + size * 0.5;
  const radius = size * 0.245;

  ctx.save();
  try {
    if (opts.lost) {
      // 警戒底先画；球体与短刺仍保持原有颜色和轮廓。
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.37, 0, TAU);
      ctx.fillStyle = opts.danger ?? '#c94e43';
      ctx.fill();
    }

    // 连同圆头笔触均位于格子内 10%~90% 区域，最小尺寸也不侵入邻格。
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.075;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let direction = 0; direction < 8; direction += 1) {
      const angle = direction * Math.PI / 4;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.moveTo(cx + dx * size * 0.20, cy + dy * size * 0.20);
      ctx.lineTo(cx + dx * size * 0.355, cy + dy * size * 0.355);
    }
    ctx.stroke();

    let body = color;
    if (typeof ctx.createRadialGradient === 'function') {
      const gradient = ctx.createRadialGradient(
        cx - radius * 0.32, cy - radius * 0.4, radius * 0.04,
        cx, cy, radius * 1.15,
      );
      gradient.addColorStop(0, '#91a7bd');
      gradient.addColorStop(0.43, color);
      gradient.addColorStop(1, '#152334');
      body = gradient;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = '#152334';
    ctx.lineWidth = size * 0.035;
    ctx.stroke();

    // 一段金属边光和一点柔和高光，避免小格子里的主体被白色反光盖住。
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.76, Math.PI * 1.03, Math.PI * 1.46);
    ctx.strokeStyle = '#91a7bd';
    ctx.lineWidth = size * 0.025;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - radius * 0.32, cy - radius * 0.38, size * 0.043, 0, TAU);
    ctx.fillStyle = highlight;
    ctx.fill();
  } finally {
    ctx.restore();
  }
}
