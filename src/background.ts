// Фон: открывает TrackDesk по значку и вкладку YouTrack для входа, когда сессия истекла.
import { api, YOUTRACK, YOUTRACK_MATCH } from './shared';

const APP_URL = api.runtime.getURL('app.html');

async function focus(tab: any) {
  await api.tabs.update(tab.id, { active: true });
  await api.windows.update(tab.windowId, { focused: true });
}

api.action.onClicked.addListener(async () => {
  const [tab] = (await api.tabs.query({})).filter((t: any) => t.url && t.url.startsWith(APP_URL));
  if (tab) await focus(tab);
  else await api.tabs.create({ url: APP_URL });
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
