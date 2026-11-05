// Фон: открывает TrackDesk по значку и вкладку YouTrack для входа, когда сессия истекла;
// раз в несколько часов проверяет новую версию на GitHub и ставит отметку на значок.
import { api, PLATFORM, VERSION, YOUTRACK, YOUTRACK_MATCH } from './shared';
import { checkUpdate, CHECK_EVERY_MS, isNewer, isStale, type UpdateState } from './core/update';

const APP_URL = api.runtime.getURL('app.html');

async function focus(tab: any) {
  await api.tabs.update(tab.id, { active: true });
  await api.windows.update(tab.windowId, { focused: true });
}

async function openApp() {
  const [tab] = (await api.tabs.query({})).filter((t: any) => t.url && t.url.startsWith(APP_URL));
  if (tab) await focus(tab);
  else await api.tabs.create({ url: APP_URL });
}

api.action.onClicked.addListener(openApp);

// ---------- Обновления ----------
async function showBadge(state: UpdateState | null) {
  const v = state?.latest?.version;
  const fresh = !!v && isNewer(v, VERSION);
  await api.action.setBadgeText({ text: fresh ? '↑' : '' });
  if (fresh) {
    await api.action.setBadgeBackgroundColor({ color: '#7c3aed' });
    await api.action.setTitle({ title: `Открыть TrackDesk — доступна версия ${v}` });
  } else {
    await api.action.setTitle({ title: 'Открыть TrackDesk' });
  }
}

async function checkForUpdate(force = false) {
  const prev: UpdateState | null = (await api.storage.local.get('update')).update ?? null;
  if (!force && !isStale(prev)) return showBadge(prev);
  const state = await checkUpdate(PLATFORM, prev);
  await api.storage.local.set({ update: state });
  await showBadge(state);
}

api.alarms.create('checkUpdate', { periodInMinutes: CHECK_EVERY_MS / 60000, delayInMinutes: 1 });
api.alarms.onAlarm.addListener((a: any) => { if (a.name === 'checkUpdate') checkForUpdate(); });
api.runtime.onStartup.addListener(() => checkForUpdate());
api.runtime.onInstalled.addListener(async () => {
  // После «Перезапустить» в настройках — вернуть вкладку TrackDesk, которую закрыл перезапуск.
  const { reopenAfterUpdate } = await api.storage.local.get('reopenAfterUpdate');
  if (reopenAfterUpdate) {
    await api.storage.local.remove('reopenAfterUpdate');
    await openApp();
  }
  checkForUpdate(true);
});
// Вкладка сама проверила обновление — обновить значок.
api.storage.onChanged.addListener((changes: any, area: string) => {
  if (area === 'local' && changes.update) showBadge(changes.update.newValue ?? null);
});

api.runtime.onMessage.addListener((m: any, sender: any, sendResponse: (r: unknown) => void) => {
  if (!m || m.to !== 'background' || m.op !== 'openYouTrack') return;
  (async () => {
    const [tab] = await api.tabs.query({ url: YOUTRACK_MATCH });
    if (tab) {
      await api.tabs.reload(tab.id);
      await focus(tab);
    } else {
      await api.tabs.create({ url: YOUTRACK + '/', windowId: sender?.tab?.windowId, index: sender?.tab ? sender.tab.index + 1 : undefined });
    }
    sendResponse({ ok: true });
  })();
  return true;
});
