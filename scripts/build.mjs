// Сборка TrackDesk: dist/firefox, dist/chromium и пакеты в release/.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { join, relative } from 'node:path';

/** Упаковать папку в zip (для .xpi и .zip), без внешних программ. */
function zipDir(dir, file) {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk(dir);
  const local = [], central = [];
  let offset = 0;
  for (const p of files) {
    const name = Buffer.from(relative(dir, p).replace(/\\/g, '/'));
    const data = readFileSync(p);
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(file, Buffer.concat([...local, cd, end]));
}

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = pkg.version;
const YOUTRACK = 'https://youtrack.office.lan';

const base = {
  manifest_version: 3,
  name: 'TrackDesk',
  version,
  description: 'Задачи YouTrack по исполнителю: выполненные задачи, доски, комментарии и выгрузка для отчёта.',
  icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 96: 'icons/icon96.png', 128: 'icons/icon128.png' },
  action: { default_title: 'Открыть TrackDesk', default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' } },
  permissions: ['storage', 'tabs', 'cookies'],
  // chat.office.lan — ИИ-чат (вход по cookie token, как в LogDesk)
  host_permissions: [YOUTRACK + '/*', 'https://chat.office.lan/*'],
};

const targets = {
  firefox: {
    ...base,
    background: { scripts: ['background.js'] },
    browser_specific_settings: { gecko: { id: 'trackdesk@cashdash.local', strict_min_version: '115.0' } },
  },
  chromium: { ...base, minimum_chrome_version: '116', background: { service_worker: 'background.js' } },
};

rmSync('dist', { recursive: true, force: true });
mkdirSync('release', { recursive: true });
mkdirSync('latest', { recursive: true });
for (const [name, manifest] of Object.entries(targets)) {
  const out = join('dist', name);
  await build({
    entryPoints: { background: 'src/background.ts', app: 'src/app/app.ts' },
    outdir: out, bundle: true, format: 'iife', target: ['firefox115', 'chrome116'], charset: 'utf8',
    define: { __VERSION__: JSON.stringify(version) }, logLevel: 'warning',
  });
  const p = join(out, 'app.js');
  writeFileSync(p, readFileSync(p, 'utf-8').replaceAll('__VERSION__', version));
  cpSync('src/app/app.html', join(out, 'app.html'));
  cpSync('src/app/app.css', join(out, 'app.css'));
  cpSync('src/icons', join(out, 'icons'), { recursive: true });
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const file = name === 'firefox' ? `TrackDesk-${version}-firefox.xpi` : `TrackDesk-${version}-chromium.zip`;
  rmSync(join('release', file), { force: true });
  zipDir(out, join('release', file));
  cpSync(join('release', file), join('latest', name === 'firefox' ? 'TrackDesk-firefox.xpi' : 'TrackDesk-chromium.zip'));
  console.log('✓', name, '→ release/' + file);
}
