// Иконки TrackDesk (фиолетовый квадрат с белой галочкой) — PNG без внешних программ, в src/icons/.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Расстояние от точки до отрезка. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function icon(size) {
  const S = 4; // сглаживание: 4×4 выборки на пиксель
  const buf = Buffer.alloc(size * size * 4);
  const r = 0.22, stroke = 0.085;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let inBox = 0, inTick = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
      const qx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      if (Math.hypot(qx, qy) <= r) {
        inBox++;
        const d = Math.min(segDist(u, v, 0.27, 0.52, 0.43, 0.68), segDist(u, v, 0.43, 0.68, 0.74, 0.34));
        if (d <= stroke) inTick++;
      }
    }
    const a = inBox / (S * S), w = inBox ? inTick / inBox : 0;
    const t = (x + y) / (2 * size); // градиент: фиолетовый → малиновый
    const base = [124 + (219 - 124) * t, 58 + (39 - 58) * t, 237 + (119 - 237) * t];
    const i = (y * size + x) * 4;
    buf[i] = Math.round(base[0] + (255 - base[0]) * w);
    buf[i + 1] = Math.round(base[1] + (255 - base[1]) * w);
    buf[i + 2] = Math.round(base[2] + (255 - base[2]) * w);
    buf[i + 3] = Math.round(a * 255);
  }
  return png(size, buf);
}

mkdirSync('src/icons', { recursive: true });
for (const s of [16, 32, 48, 96, 128]) writeFileSync(`src/icons/icon${s}.png`, icon(s));
console.log('✓ src/icons');
