// Значки YouTrack Reports из src/icons/logo.svg: PNG 16–128 px на прозрачном фоне, в src/icons/.
// Рисует установленный Chrome без окна (CHROME=путь, если он стоит не там). Запуск: npm run icons
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SIZES = [16, 32, 48, 96, 128];
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
if (!CHROME) throw new Error('Не найден Chrome — укажите путь в переменной CHROME');

const svg = readFileSync('src/icons/logo.svg', 'utf-8');
const dir = mkdtempSync(join(tmpdir(), 'icons-'));
try {
  for (const size of SIZES) {
    const html = join(dir, `${size}.html`);
    writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    const shot = join(dir, `${size}.png`);
    execFileSync(CHROME, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', `--window-size=${size},${size}`, `--screenshot=${shot}`, 'file://' + html,
    ], { stdio: 'ignore' });
    renameSync(shot, resolve('src/icons', `icon${size}.png`));
    console.log(`src/icons/icon${size}.png`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
