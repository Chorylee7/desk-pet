// 把拼豆图案渲染成放大 PNG，肉眼校验图案是否好看（纯 Node，无依赖）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const pattern = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pets', 'duck.json'), 'utf8'));
const grid = pattern.grid;
const rows = grid.length;
const cols = grid[0].length;

// ---------- 颜色工具 ----------
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function darken(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
}

// ---------- PNG 编码 ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(w, h, rgb) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 渲染 ----------
const CELL = 28;        // 每格像素
const MARGIN = 2;       // 豆子内缩
const CORNER = 7;       // 圆角
const HOLE = 8;         // 中心孔半径
const W = cols * CELL, H = rows * CELL;

const boardBg = [237, 242, 247];
const pegColor = [201, 213, 224];

function inRoundRect(px, py, x0, y0, s, r) {
  const x1 = x0 + s, y1 = y0 + s;
  if (px < x0 || px >= x1 || py < y0 || py >= y1) return false;
  const cx = Math.max(x0 + r, Math.min(px, x1 - r - 1));
  const cy = Math.max(y0 + r, Math.min(py, y1 - r - 1));
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}
function inCircle(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

const img = Buffer.alloc(W * H * 3);

function put(px, py, color) {
  const i = (py * W + px) * 3;
  img[i] = color[0]; img[i + 1] = color[1]; img[i + 2] = color[2];
}

for (let gy = 0; gy < rows; gy++) {
  for (let gx = 0; gx < cols; gx++) {
    const ch = grid[gy][gx];
    const x0 = gx * CELL, y0 = gy * CELL;
    const holeColor = [255, 255, 255];
    let beadColor = null, holeCx = 0, holeCy = 0;
    if (ch !== '.' && pattern.palette[ch]) {
      beadColor = hexToRgb(pattern.palette[ch]);
      holeCx = x0 + CELL / 2; holeCy = y0 + CELL / 2;
    }
    for (let py = y0; py < y0 + CELL; py++) {
      for (let px = x0; px < x0 + CELL; px++) {
        if (beadColor) {
          // 豆子本体（圆角方块）
          if (inRoundRect(px, py, x0 + MARGIN, y0 + MARGIN, CELL - MARGIN * 2, CORNER)) {
            // 中心孔：比豆子更亮的高光圈 + 深色孔
            if (inCircle(px, py, holeCx, holeCy, HOLE)) {
              put(px, py, inCircle(px, py, holeCx, holeCy, HOLE * 0.55) ? darken(pattern.palette[ch], 0.6) : [255, 255, 255]);
            } else {
              put(px, py, beadColor);
            }
          } else {
            put(px, py, boardBg);
          }
        } else {
          // 空位：底板 + 凸点
          put(px, py, boardBg);
          if (inCircle(px, py, x0 + CELL / 2, y0 + CELL / 2, 4)) put(px, py, pegColor);
        }
      }
    }
  }
}

// 计算豆子数
let beadCount = 0;
grid.forEach(row => { for (const c of row) if (c !== '.') beadCount++; });

const outDir = path.join(__dirname, '..', 'preview');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'duck-preview.png');
fs.writeFileSync(outFile, encodePNG(W, H, img));
console.log(`尺寸 ${cols}x${rows}，豆子数 ${beadCount}`);
console.log('preview written to', outFile);
