// Разработка: страница YouTrack Reports на тестовых данных с пересборкой при изменениях.
// npm run dev (или bun run dev) → http://localhost:8778/app.html; после правки — обновить страницу.
import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const out = join('dist', 'dev');
const version = JSON.parse(readFileSync('package.json', 'utf-8')).version + '-dev';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('src/app/app.html', join(out, 'app.html'));
cpSync('src/icons', join(out, 'icons'), { recursive: true });

// Версия в src/shared.ts — строка '__VERSION__'; в сборке её подставляет build.mjs, здесь — плагин
const versionPlugin = {
  name: 'version',
  setup(b) {
    b.onLoad({ filter: /src[\\/]shared\.ts$/ }, (args) => ({
      contents: readFileSync(args.path, 'utf-8').replaceAll('__VERSION__', version),
      loader: 'ts',
    }));
  },
};

const ctx = await context({
  entryPoints: { app: 'src/app/main.tsx' },
  outdir: out, bundle: true, format: 'iife', target: ['chrome116', 'firefox115'], charset: 'utf8',
  jsx: 'automatic', sourcemap: true, plugins: [versionPlugin], loader: { '.md': 'text' },
  define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'info',
});
await ctx.watch();

// Стили: Tailwind сам следит за файлами и добавляет новые классы
const tailwind = spawn(join('node_modules', '.bin', 'tailwindcss'), ['-i', 'src/app/globals.css', '-o', join(out, 'app.css'), '--watch=always'], { stdio: ['ignore', 'inherit', 'inherit'] });

const { port } = await ctx.serve({ servedir: out, port: Number(process.env.PORT) || 8778 });
console.log(`\n  YouTrack Reports (тестовые данные): http://localhost:${port}/app.html\n  Пересборка при изменениях; после правки обновите страницу. Ctrl+C — выход.\n`);

const stop = () => { tailwind.kill(); ctx.dispose().finally(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
