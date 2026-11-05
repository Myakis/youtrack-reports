import { defineConfig } from 'vitest/config';

// Даты в выгрузке — по московскому времени.
process.env.TZ = 'Europe/Moscow';
export default defineConfig({ test: { env: { TZ: 'Europe/Moscow' } } });
