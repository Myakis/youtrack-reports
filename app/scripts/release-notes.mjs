// Текст релиза на GitHub: раздел CHANGELOG.md для версии и как установить.
// node scripts/release-notes.mjs 0.6.5 > notes.md   (из папки app; CHANGELOG.md — в корне репозитория)
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Укажите версию: node scripts/release-notes.mjs 0.6.5');
  process.exit(1);
}

const lines = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf-8').split(/\r?\n/);
const start = lines.findIndex((l) => l === `## ${version}` || l.startsWith(`## ${version} `));
if (start < 0) {
  console.error(`В CHANGELOG.md нет раздела «## ${version}»`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
if (end < 0) end = lines.length;
const body = lines.slice(start + 1, end).join('\n').trim();

console.log(`${body}

---

**Установка**

- **Chrome / Edge / Яндекс Браузер:** распакуйте \`TrackDesk-${version}-chromium.zip\` в постоянную папку →
  \`chrome://extensions\` → «Режим разработчика» → «Загрузить распакованное расширение». При обновлении — распакуйте
  поверх той же папки и нажмите ⟳ у TrackDesk.
- **Firefox Developer Edition:** \`about:config\` → \`xpinstall.signatures.required\` = \`false\`, затем перетащите
  \`TrackDesk-${version}-firefox.xpi\` в окно браузера.`);
