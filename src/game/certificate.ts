/**
 * Draw the finish certificate onto a canvas and download it as a PNG — no
 * external libraries. The look mirrors the on-screen certificate: parchment,
 * a gold double border and seal, the level, score, verse reference, the date +
 * time, and a cursive "Lucas Academy" signature.
 */

export interface CertificateData {
  pass: boolean;
  certLevel: number;
  clearedCount: number;
  scorePercent: number;
  reference: string;
  referenceZh: string;
  awarded: string; // date + time string
}

const C = {
  parchment: '#f6efe0',
  ivory: '#fbf6ea',
  ink: '#2b2620',
  inkSoft: '#554d40',
  gold: '#c8a24c',
  goldDeep: '#a9842f',
  goldSoft: '#e3ca7f',
  sage: '#6f9163',
  navy: '#16233b',
};

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'PingFang SC', serif";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', sans-serif";
const CURSIVE = "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', 'Bradley Hand', cursive";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wrap `text` to `maxWidth` and return the lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Render the certificate to a fresh canvas (logical 1200×848, 2× backing). */
export function renderCertificate(data: CertificateData): HTMLCanvasElement {
  const W = 1200;
  const H = 848;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(scale, scale);
  const cx = W / 2;

  // Background
  ctx.fillStyle = C.parchment;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, 150, 30, cx, 300, 700);
  glow.addColorStop(0, 'rgba(227,202,127,0.20)');
  glow.addColorStop(1, 'rgba(227,202,127,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Double border
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  roundRect(ctx, 26, 26, W - 52, H - 52, 22);
  ctx.stroke();
  ctx.strokeStyle = C.goldDeep;
  ctx.lineWidth = 1.5;
  roundRect(ctx, 40, 40, W - 80, H - 80, 16);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Seal with a little book emblem
  const sy = 150;
  ctx.beginPath();
  ctx.arc(cx, sy, 54, 0, Math.PI * 2);
  const seal = ctx.createRadialGradient(cx, sy - 12, 6, cx, sy, 54);
  seal.addColorStop(0, C.goldSoft);
  seal.addColorStop(1, 'rgba(227,202,127,0.15)');
  ctx.fillStyle = seal;
  ctx.fill();
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 4;
  ctx.stroke();
  // book
  ctx.fillStyle = C.navy;
  roundRect(ctx, cx - 22, sy - 20, 44, 40, 6);
  ctx.fill();
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, sy - 14);
  ctx.lineTo(cx, sy + 16);
  ctx.stroke();
  ctx.strokeStyle = C.goldSoft;
  ctx.lineWidth = 1.6;
  for (const dx of [-13, 8]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx, sy - 8);
    ctx.lineTo(cx + dx + 5, sy - 8);
    ctx.moveTo(cx + dx, sy - 1);
    ctx.lineTo(cx + dx + 5, sy - 1);
    ctx.stroke();
  }

  // Kicker
  ctx.fillStyle = C.goldDeep;
  ctx.font = `700 18px ${SANS}`;
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '4px';
  ctx.fillText('LUCAS ACADEMY · BIBLE SEQUENCE', cx, 246);
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';

  // Title
  ctx.fillStyle = C.ink;
  ctx.font = `600 46px ${SERIF}`;
  ctx.fillText('Certificate of Scripture Memory', cx, 300);

  if (data.pass) {
    ctx.fillStyle = C.sage;
    ctx.font = `700 16px ${SANS}`;
    if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '2px';
    ctx.fillText('★ FULL JOURNEY COMPLETE ★', cx, 332);
    if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  }

  // "This certifies that you passed"
  ctx.fillStyle = C.inkSoft;
  ctx.font = `400 21px ${SANS}`;
  ctx.fillText('This certifies that you passed', cx, data.pass ? 372 : 360);

  // Level
  ctx.fillStyle = C.goldDeep;
  ctx.font = `700 84px ${SERIF}`;
  ctx.fillText(`Level ${data.certLevel}`, cx, data.pass ? 452 : 444);

  // Score bar
  const barW = 380;
  const barY = data.pass ? 480 : 472;
  ctx.fillStyle = 'rgba(85,77,64,0.16)';
  roundRect(ctx, cx - barW / 2, barY, barW, 12, 6);
  ctx.fill();
  const fillW = Math.max(0, Math.min(1, data.scorePercent / 100)) * barW;
  if (fillW > 0) {
    const grad = ctx.createLinearGradient(cx - barW / 2, 0, cx - barW / 2 + barW, 0);
    grad.addColorStop(0, C.sage);
    grad.addColorStop(1, C.gold);
    ctx.fillStyle = grad;
    roundRect(ctx, cx - barW / 2, barY, fillW, 12, 6);
    ctx.fill();
  }
  ctx.fillStyle = C.inkSoft;
  ctx.font = `600 16px ${SANS}`;
  const levelWord = data.clearedCount === 1 ? 'level' : 'levels';
  ctx.fillText(
    `${data.scorePercent}% hearts kept · ${data.clearedCount} ${levelWord} cleared`,
    cx,
    barY + 34,
  );

  // Body
  ctx.fillStyle = C.inkSoft;
  ctx.font = `400 21px ${SERIF}`;
  const ref = data.reference
    ? ` — up to ${data.reference}${data.referenceZh ? ` · ${data.referenceZh}` : ''}`
    : '';
  const body = `Having studied and restored the Word of God through Level ${data.certLevel} of Bible Sequence${ref}.`;
  const lines = wrap(ctx, body, 780);
  let by = barY + 78;
  for (const line of lines) {
    ctx.fillText(line, cx, by);
    by += 30;
  }

  // Divider
  const dy = Math.min(by + 24, 706);
  const dGrad = ctx.createLinearGradient(cx - 260, 0, cx + 260, 0);
  dGrad.addColorStop(0, 'rgba(169,132,47,0)');
  dGrad.addColorStop(0.5, C.goldDeep);
  dGrad.addColorStop(1, 'rgba(169,132,47,0)');
  ctx.strokeStyle = dGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 260, dy);
  ctx.lineTo(cx + 260, dy);
  ctx.stroke();

  // Footer: awarded date+time (left) · signature (right)
  const footY = 770;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.inkSoft;
  ctx.font = `700 12px ${SANS}`;
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '1.5px';
  ctx.fillText('AWARDED', 110, footY - 22);
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  ctx.fillStyle = C.ink;
  ctx.font = `600 18px ${SANS}`;
  ctx.fillText(data.awarded, 110, footY + 2);

  ctx.textAlign = 'right';
  ctx.fillStyle = C.inkSoft;
  ctx.font = `700 12px ${SANS}`;
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '1.5px';
  ctx.fillText('ISSUED BY', W - 110, footY - 26);
  if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  ctx.fillStyle = C.goldDeep;
  ctx.font = `italic 400 44px ${CURSIVE}`;
  ctx.fillText('Lucas Academy', W - 104, footY + 10);

  ctx.textAlign = 'left';
  return canvas;
}

/** Render and download the certificate as a PNG. */
export function downloadCertificate(data: CertificateData): void {
  try {
    const canvas = renderCertificate(data);
    const filename = `bible-sequence-certificate-level-${data.certLevel}.png`;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  } catch {
    /* canvas/blob unavailable — the on-screen certificate is still there */
  }
}
