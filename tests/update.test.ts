import { describe, expect, it } from 'vitest';
import { checkUpdate, compareVersions, fetchLatest, isNewer, isStale, parseRelease, RELEASES_URL, CHECK_EVERY_MS } from '../src/core/update';

const release = {
  tag_name: 'v0.7.0',
  html_url: 'https://github.com/Myakis/youtrack-reports/releases/tag/v0.7.0',
  body: '- Новое',
  published_at: '2026-11-05T10:00:00Z',
  assets: [
    { name: 'TrackDesk-0.7.0-chromium.zip', browser_download_url: 'https://example/c.zip' },
    { name: 'TrackDesk-0.7.0-firefox.xpi', browser_download_url: 'https://example/f.xpi' },
  ],
};

const respond = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('сравнение версий', () => {
  it('по числам, а не по строкам', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.6.5', '0.6.5')).toBe(0);
    expect(compareVersions('v0.6.5', '0.6.6')).toBeLessThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
  it('новее — только строго большая', () => {
    expect(isNewer('0.7.0', '0.6.5')).toBe(true);
    expect(isNewer('0.6.5', '0.6.5')).toBe(false);
    expect(isNewer('0.6.4', '0.6.5')).toBe(false);
  });
});

describe('релиз с GitHub', () => {
  it('пакет для своего браузера', () => {
    expect(parseRelease(release, 'chromium')).toEqual({
      version: '0.7.0', notes: '- Новое', page: release.html_url, download: 'https://example/c.zip', published: '2026-11-05T10:00:00Z',
    });
    expect(parseRelease(release, 'firefox').download).toBe('https://example/f.xpi');
  });
  it('нет пакета — ссылка на страницу релиза', () => {
    expect(parseRelease({ ...release, assets: [] }, 'firefox').download).toBe(release.html_url);
    expect(parseRelease({ tag_name: '1.0.0' }, 'chromium').download).toBe(RELEASES_URL);
  });
  it('неожиданный ответ — ошибка', () => {
    expect(() => parseRelease({ message: 'x' }, 'chromium')).toThrow();
  });
  it('404 — релизов ещё нет', async () => {
    expect(await fetchLatest('chromium', respond(404))).toBeNull();
  });
  it('ограничение запросов и обрыв связи — понятная ошибка', async () => {
    await expect(fetchLatest('chromium', respond(403))).rejects.toThrow('ограничил');
    await expect(fetchLatest('chromium', (async () => { throw new TypeError('fail'); }) as unknown as typeof fetch)).rejects.toThrow('Нет связи');
  });
  it('при ошибке остаётся прошлый найденный релиз', async () => {
    const prev = { checkedAt: 1, latest: parseRelease(release, 'chromium') };
    const s = await checkUpdate('chromium', prev, respond(500));
    expect(s.latest?.version).toBe('0.7.0');
    expect(s.error).toBe('GitHub ответил 500');
  });
  it('устаревшая проверка', () => {
    expect(isStale(null)).toBe(true);
    expect(isStale({ checkedAt: 1000, latest: null }, 1000 + CHECK_EVERY_MS - 1)).toBe(false);
    expect(isStale({ checkedAt: 1000, latest: null }, 1000 + CHECK_EVERY_MS + 1)).toBe(true);
  });
});
