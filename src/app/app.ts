// Страница TrackDesk: выбор исполнителя, поиск выполненных задач, детали и выгрузка.
import { api, inExtension, PLATFORM, VERSION, YOUTRACK, YOUTRACK_MATCH } from '../shared';
import { checkUpdate, isNewer, isStale, type UpdateState } from '../core/update';
import { md } from './md';
import {
  attachBoards, badParts, baseQuery, buildQuery, fmtDate, isParseError, dropEach, findAssigneeAttr, knownStates, listProjects, listUsers, me, queryParts, searchIssues, withoutPeriod, YtError,
  type DateField, type Fetcher, type Issue, type Project, type QueryOptions, type RawResponse, type Signal, type User,
} from '../core/youtrack';
import { findParticipation, issuesByKeys, ROLE_NAMES, type Role } from '../core/participation';
import { fileName, toCSV, toJSON, toMarkdown, toTxt, type ExportMeta, type ExportOptions } from '../core/export';
import { periodLabel, PRESETS, presetRange, type Preset } from '../core/period';
import { mockFetch } from './mock';
import { aiShown, initAi, openAi } from './ai';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const num = (n: number) => n.toLocaleString('ru');

// ---------- Хранилище настроек ----------
const store = {
  async get<T>(key: string, def: T): Promise<T> {
    try {
      if (inExtension) return ((await api.storage.local.get(key))[key] ?? def) as T;
      const v = localStorage.getItem('td.' + key);
      return v == null ? def : JSON.parse(v);
    } catch { return def; }
  },
  async set(key: string, value: unknown) {
    try {
      if (inExtension) await api.storage.local.set({ [key]: value });
      else localStorage.setItem('td.' + key, JSON.stringify(value));
    } catch { /* настройки не сохранятся — не страшно */ }
  },
};

// ---------- Состояние ----------
let token = '';
let users: User[] = [];
let projects: Project[] = [];
let team: string[] = [];          // логины «моей команды»
let issues: Issue[] = [];
let lastMeta: ExportMeta | null = null;
let lastLogin = '';
const excluded = new Set<string>(); // ключи задач, с которых сняли галочку
let selected = '';
let sortKey = 'resolved', sortDir: 1 | -1 = -1;
let queryEdited = false;
let assigneeAttr = 'assignee';   // как искать исполнителя — подбирается, если не работает
let running: Signal | null = null;
let format: 'md' | 'json' | 'csv' | 'txt' = 'md';

// ---------- Сеть ----------
const extFetch: Fetcher = async (path) => {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  try {
    const r = await fetch(YOUTRACK + path, { headers, credentials: token ? 'omit' : 'include', redirect: 'manual', cache: 'no-store' });
    return { status: r.status, type: r.type, text: r.type === 'opaqueredirect' ? '' : await r.text() } as RawResponse;
  } catch (e) {
    return { status: 0, type: 'error', text: '', error: (e as Error).message };
  }
};
const yt: Fetcher = inExtension ? extFetch : mockFetch;

async function hasPerm(): Promise<boolean> {
  if (!inExtension) return true;
  try { return await api.permissions.contains({ origins: [YOUTRACK_MATCH] }); } catch { return true; }
}

const openYt = (path = '/') => (inExtension ? api.tabs.create({ url: YOUTRACK + path }) : open(YOUTRACK + path));

// ---------- Мелкие элементы ----------
let toastTimer = 0;
function toast(text: string, ms = 2200) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
}

function setConn(state: 'ok' | 'err' | 'busy', text: string) {
  $('conn').dataset.state = state;
  $('connText').textContent = text;
}

function notice(kind: 'warn' | 'err', html: string, buttons: { label: string; run: () => void }[] = []) {
  const n = $('notice');
  n.dataset.kind = kind;
  $('noticeBody').innerHTML = html;
  const bs = $('noticeBtns');
  bs.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    el.onclick = b.run;
    bs.appendChild(el);
  }
  n.hidden = false;
}
const hideNotice = () => { $('notice').hidden = true; };

function showError(e: unknown, retry: () => void) {
  const err = e as YtError;
  if (err.kind === 'auth' && err.status !== 403) {
    setConn('err', 'Нет входа');
    notice('warn', `<p><b>Нужен вход в YouTrack.</b> Откройте youtrack.office.lan, войдите и нажмите «Повторить».
      Если не помогает — укажите постоянный токен в «Настройках».</p>`, [
      { label: 'Открыть YouTrack', run: () => openYt() },
      { label: 'Указать токен', run: openSettings },
      { label: 'Повторить', run: retry },
    ]);
  } else {
    notice('err', `<p><b>Ошибка:</b> ${esc(err.message || String(e))}</p>`, [{ label: 'Повторить', run: retry }]);
  }
}

// ---------- Подключение ----------
async function connect() {
  hideNotice();
  if (!(await hasPerm())) {
    setConn('err', 'Нет доступа');
    notice('warn', '<p><b>Нужно разрешение на доступ к youtrack.office.lan.</b> Нажмите «Разрешить доступ» и подтвердите запрос браузера.</p>', [
      {
        label: 'Разрешить доступ',
        run: async () => {
          if (await api.permissions.request({ origins: [YOUTRACK_MATCH] }).catch(() => false)) return connect();
          notice('warn', '<p><b>Доступ не выдан.</b> Если запрос не появился — Chrome: <code>chrome://extensions</code> → TrackDesk → «Подробнее» → «Доступ к сайтам» → добавьте https://youtrack.office.lan (или «На всех сайтах»); если TrackDesk обновляли — нажмите там ⟳. Firefox: <code>about:addons</code> → TrackDesk → «Разрешения». TrackDesk продолжит сам.</p>', [
            { label: 'Повторить', run: connect },
          ]);
        },
      },
    ]);
    // Разрешение выдали в about:addons — подключиться без перезагрузки
    try { api.permissions.onAdded.addListener(function once(p: any) { if ((p?.origins || []).includes(YOUTRACK_MATCH)) { api.permissions.onAdded.removeListener(once); connect(); } }); } catch { /* нет onAdded */ }
    return;
  }
  setConn('busy', 'Подключение…');
  try {
    const u = await me(yt);
    setConn('ok', u.name + (token ? ' · токен' : ''));
  } catch (e) {
    showError(e, connect);
    return;
  }
  // Списки для подсказок: без прав на них просто вводите логин вручную
  listUsers(yt).then((us) => { users = us; fillUsers(); renderTeam(); }).catch(() => {
    $<HTMLInputElement>('assignee').placeholder = 'Логин (список пользователей недоступен)';
  });
  listProjects(yt).then((ps) => { projects = ps; fillProjects(); }).catch(() => {});
  knownStates(yt, $<HTMLInputElement>('project').value).then(fillStates).catch(() => {});
}

function fillUsers() {
  $('usersList').innerHTML = users.map((u) => `<option value="${esc(u.login)}">${esc(u.name)}${u.email ? ' · ' + esc(u.email) : ''}</option>`).join('');
  updateStar();
}
function fillProjects() {
  $('projectsList').innerHTML = projects.map((p) => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('');
}

/** Логин из поля «Исполнитель»: принимаем и логин, и полное имя. */
function assigneeLogin(): string {
  const v = $<HTMLInputElement>('assignee').value.trim();
  const low = v.toLowerCase();
  const u = users.find((x) => x.login.toLowerCase() === low) || users.find((x) => x.name.toLowerCase() === low);
  return u ? u.login : v;
}
const userName = (login: string) => users.find((u) => u.login === login)?.name || login;

// ---------- Команда ----------
function renderTeam() {
  const box = $('team');
  box.innerHTML = '';
  const cur = assigneeLogin();
  for (const login of team) {
    const c = document.createElement('span');
    c.className = 'chip' + (login === cur ? ' sel' : '');
    c.innerHTML = `<span class="nm" title="${esc(login)}">${esc(userName(login))}</span><button title="Убрать из команды">✕</button>`;
    (c.querySelector('.nm') as HTMLElement).onclick = () => { $<HTMLInputElement>('assignee').value = login; onFormChange(); search(); };
    (c.querySelector('button') as HTMLElement).onclick = () => { team = team.filter((x) => x !== login); store.set('team', team); renderTeam(); updateStar(); };
    box.appendChild(c);
  }
  $('teamHint').hidden = team.length > 0;
}

function updateStar() {
  const on = team.includes(assigneeLogin());
  const b = $('btnStar');
  b.textContent = on ? '★' : '☆';
  b.classList.toggle('on', on);
}

function toggleStar() {
  const login = assigneeLogin();
  if (!login) return toast('Сначала выберите исполнителя');
  team = team.includes(login) ? team.filter((x) => x !== login) : [...team, login];
  store.set('team', team);
  renderTeam();
  updateStar();
}

// ---------- Форма и запрос ----------
function formOptions(): QueryOptions {
  return {
    assignee: assigneeLogin(),
    states: $<HTMLInputElement>('states').value,
    types: $<HTMLInputElement>('types').value,
    tags: $<HTMLInputElement>('tags').value,
    project: $<HTMLInputElement>('project').value,
    dateField: $<HTMLSelectElement>('dateField').value as DateField,
    from: $<HTMLInputElement>('from').value,
    to: $<HTMLInputElement>('to').value,
    assigneeAttr,
  };
}
const participant = () => $<HTMLSelectElement>('mode').value === 'participant';
/** В режиме «участник» в поле запроса — только фильтр задач: условие на сотрудника TrackDesk проверяет сам. */
const formQuery = () => (participant() ? baseQuery(formOptions()) : buildQuery(formOptions()));

const PART_NAMES = { project: 'Проект', assignee: 'Исполнитель', state: 'Статус', type: 'Тип', tag: 'Тег', period: 'Период', extra: 'Запрос' };

/** YouTrack не понял запрос: найти, какая часть виновата, и подсказать, как статус называется на самом деле. */
async function explainParseError(query: string) {
  const opts = formOptions();
  if (queryEdited) {
    notice('err', `<p><b>YouTrack не понял запрос:</b> <code>${esc(query)}</code>. Проверьте его в строке поиска YouTrack
      или нажмите «↺ Из полей» в «Запросе YouTrack».</p>`, [{ label: 'Повторить', run: search }]);
    return;
  }
  notice('warn', '<p>YouTrack не понял запрос — проверяю, какая часть…</p>');
  const bad = await badParts(yt, queryParts(opts));
  const lines = bad.map((p) => `<li><b>${PART_NAMES[p.what]}:</b> <code>${esc(p.text)}</code></li>`);
  let hint = '';
  if (bad.some((p) => p.what === 'state')) {
    const states = await knownStates(yt, opts.project).catch(() => [] as string[]);
    fillStates(states);
    if (states.length) hint = `<p>Статусы у задач${opts.project ? ' проекта ' + esc(opts.project) : ''}: ${states.map((s) => `<code>${esc(s)}</code>`).join(', ')} — выберите в поле «Статус».</p>`;
  }
  if (bad.some((p) => p.what === 'assignee')) hint += '<p>Исполнителя с таким логином YouTrack не знает — выберите его из списка.</p>';
  if (bad.some((p) => p.what === 'project')) hint += '<p>Проекта с таким ключом нет — выберите его из списка.</p>';
  notice('err', bad.length
    ? `<p><b>YouTrack не понял часть запроса:</b></p><ul>${lines.join('')}</ul>${hint}`
    : `<p><b>YouTrack не понял запрос:</b> <code>${esc(query)}</code>, хотя каждая часть по отдельности верна.</p>`,
  [{ label: 'Повторить', run: search }]);
}

const many = (n: number) => (n >= 100 ? '100+' : num(n));
const openQueryInYt = (query: string) => openYt('/issues?q=' + encodeURIComponent(query));

/** Ничего не нашлось: убрать условия по очереди и показать, какое отсекает задачи, — с кнопками исправления. */
async function explainEmpty(query: string) {
  const opts = formOptions();
  const parts = queryParts(opts);
  const toYt = { label: 'Открыть запрос в YouTrack', run: () => openQueryInYt(query) };
  if (queryEdited || parts.length < 2) return;
  notice('warn', '<p>Ничего не найдено — проверяю, какое условие отсекает задачи…</p>');
  const rerun = (change: () => void) => () => { change(); onFormChange(); search(); };
  const html: string[] = [], buttons: { label: string; run: () => void }[] = [];

  const drops = await dropEach(yt, parts);
  for (const { part, found } of drops) {
    if (found <= 0) continue;
    html.push(`<li>без условия «${PART_NAMES[part.what]}» <code>${esc(part.text)}</code> — задач: ${many(found)}</li>`);
  }
  const culprit = (w: string) => drops.some((d) => d.part.what === w && d.found > 0);

  if (culprit('assignee')) {
    const alt = await findAssigneeAttr(yt, opts);
    if (alt) {
      html.push(`<li><b>С условием <code>${esc(alt.attr)}: {${esc(opts.assignee)}}</code> находится задач: ${many(alt.found)}</b> —
        «${esc(opts.assigneeAttr || 'assignee')}:» в вашем YouTrack ищет не по полю «Исполнитель».</li>`);
      buttons.push({ label: `Искать через «${alt.attr}:»`, run: rerun(() => { assigneeAttr = alt.attr; store.set('assigneeAttr', alt.attr); }) });
    } else {
      html.push(`<li>Проверьте логин <code>${esc(opts.assignee)}</code> — выберите исполнителя из выпадающего списка.</li>`);
    }
  }
  if (culprit('period')) {
    if (opts.dateField === 'resolved') {
      const r = await withoutPeriod(yt, parts).catch(() => null);
      if (r && r.found && !r.anyResolved) html.push(`<li>У этих задач <b>нет даты решения</b> — статус «${esc(opts.states)}» в YouTrack не считается «решённым».</li>`);
    }
    if (opts.dateField !== 'updated') buttons.push({ label: 'По дате обновления', run: rerun(() => { $<HTMLSelectElement>('dateField').value = 'updated'; }) });
    buttons.push({ label: 'Всё время', run: rerun(() => { $<HTMLSelectElement>('preset').value = 'all'; applyPreset(); }) });
  }
  if (culprit('state')) {
    const states = await knownStates(yt, opts.project).catch(() => [] as string[]);
    fillStates(states);
    if (states.length) html.push(`<li>Статусы у задач${opts.project ? ' проекта ' + esc(opts.project) : ''}: ${states.map((s) => `<code>${esc(s)}</code>`).join(', ')}</li>`);
  }

  if (!html.length) {
    notice('warn', `<p><b>Ничего не найдено</b>, и ни одно условие по отдельности не виновато — задач с таким сочетанием нет.
      Проверьте запрос в YouTrack: <code>${esc(query)}</code></p>`, [toYt]);
    return;
  }
  notice('warn', `<p><b>Ничего не найдено.</b> Вот что удалось выяснить:</p><ul>${html.join('')}</ul>`, [...buttons, toYt]);
}

// ---------- Статусы: мультиселект ----------
let knownStateList: string[] = [];   // статусы, которые встречаются у задач (частые первыми)

const selectedStates = () => $<HTMLInputElement>('states').value.split(',').map((s) => s.trim()).filter(Boolean);

function setStates(list: string[]) {
  $<HTMLInputElement>('states').value = [...new Set(list)].join(', ');
  renderStates();
  onFormChange();
}

function renderStates() {
  const sel = selectedStates();
  const t = $('statesText');
  t.textContent = sel.length ? sel.join(', ') : 'Любой';
  t.classList.toggle('any', !sel.length);
  $('statesBtn').title = sel.length ? `Статус: ${sel.join(' или ')}` : 'Любой статус';
  // Выбранные, которых нет среди известных (например, введённые вручную), — тоже в списке
  const all = [...knownStateList, ...sel.filter((s) => !knownStateList.includes(s))];
  $('statesOpts').innerHTML = all.length
    ? all.map((s) => `<label><input type="checkbox" value="${esc(s)}" ${sel.includes(s) ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')
    : '<div class="none">Статусы ещё не загружены — введите вручную ниже</div>';
}

function fillStates(states: string[]) {
  if (!states.length) return;
  knownStateList = states;
  renderStates();
}

function toggleStatesPop(open?: boolean) {
  const pop = $('statesPop');
  const show = open ?? pop.hidden;
  pop.hidden = !show;
  $('statesBtn').classList.toggle('open', show);
  if (show) (pop.querySelector('input') as HTMLElement | null)?.focus();
}

function addCustomState() {
  const inp = $<HTMLInputElement>('statesAdd');
  const v = inp.value.replace(/[,{}]/g, ' ').trim();
  if (!v) return;
  inp.value = '';
  setStates([...selectedStates(), v]);
}

let statesTimer = 0;
/** Сменился проект — подгрузить его статусы. */
function reloadStates() {
  clearTimeout(statesTimer);
  statesTimer = window.setTimeout(() => {
    knownStates(yt, $<HTMLInputElement>('project').value).then((s) => { knownStateList = s; renderStates(); }).catch(() => {});
  }, 500);
}

function onFormChange() {
  if (!queryEdited) $<HTMLTextAreaElement>('query').value = formQuery();
  $('qState').textContent = (queryEdited ? '· изменён вручную' : '') + (participant() ? ' · фильтр задач; участие сотрудника проверяется по истории' : '');
  $('wideBox').hidden = !participant();
  updateStar();
  renderTeam();
  store.set('form', {
    types: $<HTMLInputElement>('types').value, tags: $<HTMLInputElement>('tags').value, wide: $<HTMLInputElement>('wide').checked,
    assignee: $<HTMLInputElement>('assignee').value, states: $<HTMLInputElement>('states').value,
    project: $<HTMLInputElement>('project').value, preset: $<HTMLSelectElement>('preset').value,
    from: $<HTMLInputElement>('from').value, to: $<HTMLInputElement>('to').value,
    mode: $<HTMLSelectElement>('mode').value,
    dateField: $<HTMLSelectElement>('dateField').value, withBoards: $<HTMLInputElement>('withBoards').checked,
  });
}

function applyPreset() {
  const p = $<HTMLSelectElement>('preset').value;
  if (p === 'custom') return;
  const r = presetRange(p as Preset);
  $<HTMLInputElement>('from').value = r.from;
  $<HTMLInputElement>('to').value = r.to;
}

// ---------- Поиск ----------
function progress(text: string | null, part = 0) {
  $('progress').hidden = text == null;
  if (text != null) {
    $('progressText').textContent = text;
    $('bar').style.width = Math.round(part * 100) + '%';
  }
}

async function search() {
  const query = $<HTMLTextAreaElement>('query').value.trim();
  const login = assigneeLogin();
  const byRole = participant();
  if (!login && (!queryEdited || byRole)) return toast('Выберите сотрудника');
  // История изменений просматривается по всем задачам фильтра — без фильтра это весь YouTrack
  if (byRole && !query) return toast('Для поиска по участию укажите период или проект');
  if (running) running.cancelled = true;
  const signal: Signal = { cancelled: false };
  running = signal;
  hideNotice();
  $<HTMLButtonElement>('btnSearch').disabled = true;
  progress('Загрузка задач…', 0.05);
  let stoppedNote = '';
  try {
    let found: Issue[];
    if (byRole) {
      // «Показать найденное» — остановить проверку истории и показать то, что уже нашлось
      const stop = { requested: false };
      const btnStop = $<HTMLButtonElement>('btnStopShow');
      btnStop.hidden = false;
      btnStop.onclick = () => { stop.requested = true; btnStop.hidden = true; progress('Останавливаюсь, собираю найденное…', 0.7); };
      let r;
      try {
        r = await findParticipation(yt, query, login, {
          assigneeAttr, wide: $<HTMLInputElement>('wide').checked, signal, stop, onProgress: (t, part) => { if (!stop.requested) progress(t, part); },
        });
      } finally {
        btnStop.hidden = true;
      }
      if (r.stopped) {
        stoppedNote = `<p><b>Остановлено:</b> история проверена у ${num(r.checked)} из ${num(Math.min(r.all, 3000))} задач фильтра. В таблице — задачи
          из проверенной части и все, где сотрудник исполнитель сейчас.</p>`;
      } else if (r.truncated) {
        stoppedNote = `<p><b>В фильтре больше ${num(r.checked)} задач</b> — история просмотрена только у первых ${num(r.checked)}.
          Укажите проект (а при необходимости тип и тег), как в скрипте, или сузьте период.</p>`;
      }
      const keys = [...r.roles.keys()];
      progress(`Загрузка задач: 0 из ${num(keys.length)}…`, 0.72);
      found = await issuesByKeys(yt, YOUTRACK, keys, { signal, onProgress: (n) => progress(`Загрузка задач: ${num(n)} из ${num(keys.length)}…`, 0.72 + 0.1 * n / Math.max(1, keys.length)) });
      const roles = r.roles;
      for (const i of found) i.roles = roles.get(i.key) || [];
    } else {
      found = await searchIssues(yt, YOUTRACK, query, { signal, onProgress: (n) => progress(`Загружено задач: ${num(n)}…`, 0.3) });
    }
    if ($<HTMLInputElement>('withBoards').checked && found.length) {
      const from = byRole ? 0.82 : 0.4;
      progress('Определяю доски…', from);
      await attachBoards(yt, found, { signal, onProgress: (d, t) => progress(`Доски: ${d} из ${t}`, from + (1 - from) * d / t) });
    }
    if (signal.cancelled) return;
    issues = found;
    excluded.clear();
    lastLogin = login;
    const from = $<HTMLInputElement>('from').value, to = $<HTMLInputElement>('to').value;
    const dfLabel = $<HTMLSelectElement>('dateField').selectedOptions[0].textContent;
    lastMeta = {
      assignee: login ? `${userName(login)} (${login})${byRole ? ', участие в задачах' : ''}` : 'по запросу',
      query,
      period: periodLabel(from, to) ? `${periodLabel(from, to)} (по дате ${dfLabel})` : undefined,
      generated: Date.now(),
    };
    selected = '';
    render();
    renderDetail();
    if (!found.length && !byRole) await explainEmpty(query);
    if (!found.length && byRole) notice('warn', '<p><b>Ничего не найдено.</b> Сотрудник не был исполнителем, не менял и не комментировал задачи этого фильтра. Попробуйте расширить период или убрать статус.</p>');
    if (stoppedNote) notice('warn', stoppedNote);
  } catch (e) {
    if (signal.cancelled) return;
    if (isParseError(e)) await explainParseError(query).catch((e2) => showError(e2, search));
    else showError(e, search);
  } finally {
    if (running === signal) {
      running = null;
      progress(null);
      $<HTMLButtonElement>('btnSearch').disabled = false;
    }
  }
}

// ---------- Таблица ----------
function visible(): Issue[] {
  const f = $<HTMLInputElement>('filter').value.trim().toLowerCase();
  let list = issues;
  if (f) {
    list = list.filter((i) => [i.key, i.summary, i.project, i.tags.join(' '), i.boards.join(' '), i.description]
      .some((s) => s.toLowerCase().includes(f)));
  }
  const val = (i: Issue): string | number => {
    switch (sortKey) {
      case 'key': return i.projectKey + String(Number(i.key.split('-')[1]) || 0).padStart(9, '0');
      case 'summary': return i.summary.toLowerCase();
      case 'project': return i.project.toLowerCase();
      case 'state': return i.state.toLowerCase();
      case 'boards': return i.boards.join(' ').toLowerCase();
      case 'comments': return i.comments.length;
      default: return i.resolved || i.updated;
    }
  };
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
  });
}

const checked = () => visible().filter((i) => !excluded.has(i.key));

function render() {
  const list = visible();
  const body = $('rows');
  body.innerHTML = list.map((i) => `<tr data-key="${esc(i.key)}" class="${i.key === selected ? 'sel' : ''}${excluded.has(i.key) ? ' off' : ''}">
    <td class="c-check"><input type="checkbox" ${excluded.has(i.key) ? '' : 'checked'}></td>
    <td class="c-key">${esc(i.key)}</td>
    <td title="${esc(i.summary)}">${esc(i.summary)}</td>
    <td class="c-state" title="${esc(i.state)}"><span class="state">${esc(i.state)}</span></td>
    <td class="c-project" title="${esc(i.project)}">${esc(i.project)}</td>
    <td class="c-boards" title="${esc(i.boards.join('\n'))}">${i.boards.map((b) => `<span class="board">${esc(b)}</span>`).join('')}</td>
    <td class="c-tags" title="${esc(i.tags.join(', '))}">${i.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</td>
    <td class="c-roles">${roleBadges(i)}</td>
    <td class="c-date">${esc(fmtDate(i.resolved, false))}</td>
    <td class="c-num">${i.comments.length || ''}</td>
  </tr>`).join('');
  $('table').classList.toggle('roles', issues.some((i) => i.roles.length));
  for (const th of document.querySelectorAll<HTMLElement>('th[data-sort]')) {
    th.classList.toggle('asc', th.dataset.sort === sortKey && sortDir === 1);
    th.classList.toggle('desc', th.dataset.sort === sortKey && sortDir === -1);
  }
  const empty = $('empty');
  empty.hidden = list.length > 0;
  empty.textContent = !lastMeta ? 'Выберите исполнителя и нажмите «Найти»' : issues.length ? 'Ничего не подходит под фильтр' : 'Задач не найдено. Проверьте статус, период и запрос YouTrack.';
  const n = checked().length;
  $('summary').textContent = !lastMeta ? 'Выберите исполнителя и нажмите «Найти»'
    : `${lastMeta.assignee}: найдено ${num(issues.length)}` + (list.length !== issues.length ? ` · показано ${num(list.length)}` : '') + ` · отмечено ${num(n)}`;
  $<HTMLButtonElement>('btnExport').disabled = n === 0;
  $<HTMLButtonElement>('btnCopyAi').disabled = n === 0;
  const all = $<HTMLInputElement>('checkAll');
  all.checked = list.length > 0 && n === list.length;
  all.indeterminate = n > 0 && n < list.length;
}

const roleBadges = (i: Issue) => i.roles.map((r) => `<span class="role ${esc(r)}">${esc(ROLE_NAMES[r as Role] || r)}</span>`).join('');

/** Вкладки справа: детали задачи и ИИ-чат. */
function showTab(t: 'detail' | 'ai') {
  for (const b of document.querySelectorAll<HTMLElement>('.tabs button')) b.classList.toggle('on', b.dataset.tab === t);
  $('detail').hidden = t !== 'detail';
  $('aiPane').hidden = t !== 'ai';
  if (t === 'ai') aiShown();
}

/** «✦ Для ИИ»: чат с моделью, в нём — отмеченные задачи (как в таблице) и инструкция для отчёта. */
function openAiWithTable() {
  const list = checked();
  if (!list.length || !lastMeta) return;
  const meta = { ...lastMeta, generated: Date.now() };
  openAi({
    label: meta.assignee + (meta.period ? ' · ' + meta.period : ''),
    count: list.length,
    person: { login: lastLogin, name: lastLogin ? `${userName(lastLogin)} (${lastLogin})` : meta.assignee },
    period: meta.period,
    build: (o) => toMarkdown(list, meta, { description: o.description, comments: o.comments }),
  });
}

function select(key: string) {
  selected = key;
  for (const tr of document.querySelectorAll<HTMLElement>('#rows tr')) tr.classList.toggle('sel', tr.dataset.key === key);
  document.querySelector<HTMLElement>(`#rows tr[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
  renderDetail();
  showTab('detail');
}

function renderDetail() {
  const d = $('detail');
  const i = issues.find((x) => x.key === selected);
  if (!i) { d.innerHTML = '<div class="empty">Щёлкните задачу, чтобы увидеть описание и комментарии</div>'; return; }
  const rows: [string, string][] = [
    ...(i.roles.length ? [['Участие', roleBadges(i)] as [string, string]] : []),
    ['Проект', esc(i.project)],
    ['Доски', i.boards.map((b) => `<span class="board">${esc(b)}</span>`).join('') || '<span class="muted">—</span>'],
    ['Теги', i.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('') || '<span class="muted">—</span>'],
    ['Создана', esc(fmtDate(i.created))],
    ['Решена', esc(fmtDate(i.resolved))],
    ['Автор', esc(i.reporter)],
    ...Object.entries(i.fields).filter(([, v]) => v).map(([k, v]) => [esc(k), esc(v)] as [string, string]),
    ...(i.links.length ? [['Связи', esc(i.links.map((l) => `${l.type} ${l.keys.join(', ')}`).join('; '))] as [string, string]] : []),
  ];
  d.innerHTML = `
    <a class="key" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.key)} ↗</a>
    <h2>${esc(i.summary)}</h2>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <h3>Описание</h3>
    ${i.description.trim() ? `<div class="text">${esc(i.description)}</div>` : '<p class="muted">Нет описания</p>'}
    <h3>Комментарии (${i.comments.length})</h3>
    ${i.comments.length ? i.comments.map((c) => `<div class="comment"><div class="who"><b>${esc(c.author)}</b> · ${esc(fmtDate(c.created))}</div><div class="body">${esc(c.text)}</div></div>`).join('') : '<p class="muted">Нет комментариев</p>'}`;
}

// ---------- Выгрузка ----------
function exportOptions(): ExportOptions {
  return {
    description: $<HTMLInputElement>('optDesc').checked,
    comments: $<HTMLInputElement>('optComments').checked,
    fields: $<HTMLInputElement>('optFields').checked,
    prompt: $<HTMLInputElement>('optPrompt').checked,
  };
}

function exportText(fmt: typeof format, o: ExportOptions): string {
  const list = checked();
  const meta = { ...lastMeta!, generated: Date.now() };
  return fmt === 'md' ? toMarkdown(list, meta, o) : fmt === 'json' ? toJSON(list, meta, o) : fmt === 'txt' ? toTxt(list) : toCSV(list, o);
}

function download(text: string, name: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`✓ ${what}`);
  } catch {
    toast('Не удалось скопировать');
  }
}

function setFormat(v: typeof format) {
  format = v;
  for (const b of document.querySelectorAll<HTMLElement>('#format button')) b.classList.toggle('on', b.dataset.v === v);
  store.set('format', v);
}

function openExport() {
  if (!checked().length) return;
  $('exportCount').textContent = `Будет выгружено задач: ${num(checked().length)} (отмеченные галочкой${$<HTMLInputElement>('filter').value ? ' и подходящие под фильтр' : ''}).`;
  $<HTMLDialogElement>('dlgExport').showModal();
}

const MIME = { txt: 'text/plain;charset=utf-8', md: 'text/markdown;charset=utf-8', json: 'application/json;charset=utf-8', csv: 'text/csv;charset=utf-8' };

// ---------- Настройки ----------
function openSettings() {
  $<HTMLInputElement>('token').value = token;
  $<HTMLSelectElement>('assigneeAttr').value = assigneeAttr;
  $('settingsStatus').textContent = token ? 'Сейчас используется токен.' : 'Сейчас используется сессия браузера.';
  $<HTMLDialogElement>('dlgSettings').showModal();
  if (!updBusy) checkForUpdate(false);
}

async function saveToken(value: string) {
  token = value.trim();
  await store.set('token', token);
  $('settingsStatus').textContent = 'Проверка…';
  try {
    const u = await me(yt);
    $('settingsStatus').textContent = `✓ Вход выполнен: ${u.name} (${u.login})`;
    connect();
  } catch (e) {
    $('settingsStatus').textContent = '✕ ' + (e as Error).message;
  }
}

// ---------- Обновления ----------
let updState: UpdateState | null = null;
let updBusy = false;

function renderUpdate() {
  const latest = updState?.latest;
  const fresh = !!latest && isNewer(latest.version, VERSION);
  $('updCurrent').textContent = VERSION;
  $('updStatus').textContent = updBusy ? 'Проверка…'
    : updState?.error ? `✕ ${updState.error}`
    : !updState ? ''
    : !latest ? 'Релизов на GitHub пока нет.'
    : fresh ? `Доступна версия ${latest.version}.`
    : `✓ Это последняя версия (проверено ${new Date(updState.checkedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}).`;
  $<HTMLButtonElement>('btnUpdCheck').disabled = updBusy;

  $('updBox').hidden = !fresh;
  $('btnUpdGet').hidden = !fresh;
  $('btnUpdReload').hidden = !fresh || PLATFORM !== 'chromium' || !inExtension;
  $('updBadge').hidden = !fresh;
  if (!fresh) return;
  $('updBadge').textContent = `↑ ${latest.version}`;
  $('btnUpdGet').textContent = `Скачать ${latest.version}`;
  $('updVer').textContent = latest.version;
  $('updNotes').innerHTML = latest.notes.trim() ? md(latest.notes) : '<p class="muted">Описания нет.</p>';
  $('updHow').innerHTML = PLATFORM === 'firefox'
    ? '<li>«Скачать» — загрузится файл <code>.xpi</code>.</li><li>Перетащите его в окно Firefox и подтвердите установку — настройки сохранятся.</li>'
    : '<li>«Скачать» — загрузится архив <code>.zip</code>.</li>'
      + '<li>Распакуйте его <b>в ту же папку</b>, откуда установлено расширение, с заменой файлов.</li>'
      + '<li>«Перезапустить расширение» — TrackDesk перечитает файлы и откроется заново. Токен и настройки сохранятся.</li>';
}

async function checkForUpdate(force: boolean) {
  updState = await store.get<UpdateState | null>('update', null);
  if (!force && !isStale(updState)) return renderUpdate();
  updBusy = true;
  renderUpdate();
  updState = await checkUpdate(PLATFORM, updState);
  updBusy = false;
  await store.set('update', updState);
  renderUpdate();
}

function downloadUpdate() {
  const url = updState?.latest?.download;
  if (url) inExtension ? api.tabs.create({ url, active: false }) : open(url);
}

async function reloadExtension() {
  await store.set('reopenAfterUpdate', true);
  api.runtime.reload();
}

// ---------- Тема ----------
const THEMES = ['', 'light', 'dark'] as const;
const THEME_NAMES = { '': 'как в системе', light: 'светлая', dark: 'тёмная' };
function applyTheme(t: string) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  $('btnTheme').title = `Тема: ${THEME_NAMES[t as keyof typeof THEME_NAMES]} (щёлкните, чтобы сменить)`;
}

// ---------- Запуск ----------
async function init() {
  $('ver').textContent = inExtension ? 'v' + VERSION : 'тестовые данные';
  $<HTMLSelectElement>('preset').innerHTML = PRESETS.map((p) => `<option value="${p.v}">${p.label}</option>`).join('') + '<option value="custom">Свой период</option>';

  token = await store.get('token', '');
  assigneeAttr = await store.get('assigneeAttr', 'assignee');
  team = await store.get<string[]>('team', []);
  setFormat(await store.get('format', 'md'));
  let theme = await store.get('theme', '');
  applyTheme(theme);
  const form = await store.get<any>('form', null);
  if (form) {
    $<HTMLInputElement>('assignee').value = form.assignee || '';
    $<HTMLInputElement>('states').value = form.states ?? 'Готово';
    $<HTMLInputElement>('types').value = form.types || '';
    $<HTMLInputElement>('tags').value = form.tags || '';
    $<HTMLInputElement>('wide').checked = !!form.wide;
    $<HTMLInputElement>('project').value = form.project || '';
    $<HTMLSelectElement>('preset').value = form.preset || 'month';
    $<HTMLSelectElement>('dateField').value = form.dateField || 'resolved';
    $<HTMLInputElement>('withBoards').checked = form.withBoards !== false;
    $<HTMLSelectElement>('mode').value = form.mode === 'participant' ? 'participant' : 'assignee';
    if (form.preset === 'custom') {
      $<HTMLInputElement>('from').value = form.from || '';
      $<HTMLInputElement>('to').value = form.to || '';
    } else applyPreset();
  } else {
    $<HTMLSelectElement>('preset').value = 'month';
    applyPreset();
  }
  onFormChange();
  renderTeam();
  render();

  for (const id of ['assignee', 'types', 'tags', 'project']) $(id).addEventListener('input', onFormChange);
  $('project').addEventListener('input', reloadStates);
  renderStates();
  $('statesBtn').onclick = () => toggleStatesPop();
  $('statesOpts').addEventListener('change', () => {
    setStates([...$('statesOpts').querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value));
  });
  $('statesAddBtn').onclick = addCustomState;
  $('statesAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomState(); } });
  $('statesClear').onclick = () => setStates([]);
  $('statesDone').onclick = () => toggleStatesPop(false);
  document.addEventListener('mousedown', (e) => { if (!$('statesMs').contains(e.target as Node)) toggleStatesPop(false); });
  $('statesMs').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); toggleStatesPop(false); $('statesBtn').focus(); } });
  $('wide').addEventListener('change', onFormChange);
  $('dateField').addEventListener('change', onFormChange);
  $('mode').addEventListener('change', () => { queryEdited = false; onFormChange(); });
  $('withBoards').addEventListener('change', onFormChange);
  $('preset').addEventListener('change', () => { applyPreset(); onFormChange(); });
  for (const id of ['from', 'to']) $(id).addEventListener('change', () => { $<HTMLSelectElement>('preset').value = 'custom'; onFormChange(); });
  for (const id of ['assignee', 'types', 'tags', 'project', 'from', 'to']) {
    $(id).addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); search(); } });
  }
  $('query').addEventListener('input', () => { queryEdited = true; $('qState').textContent = '· изменён вручную'; });
  $('query').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) { e.preventDefault(); search(); } });
  $('btnResetQuery').onclick = () => { queryEdited = false; onFormChange(); };
  $('btnStar').onclick = toggleStar;
  $('btnSearch').onclick = search;
  $('btnCancel').onclick = () => { if (running) running.cancelled = true; progress(null); $<HTMLButtonElement>('btnSearch').disabled = false; running = null; };

  $('filter').addEventListener('input', render);
  $('checkAll').addEventListener('change', () => {
    const on = $<HTMLInputElement>('checkAll').checked;
    for (const i of visible()) on ? excluded.delete(i.key) : excluded.add(i.key);
    render();
  });
  $('rows').addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest('tr') as HTMLElement | null;
    if (!tr) return;
    const key = tr.dataset.key!;
    if ((e.target as HTMLElement).matches('input[type=checkbox]')) {
      (e.target as HTMLInputElement).checked ? excluded.delete(key) : excluded.add(key);
      render();
      return;
    }
    select(key);
  });
  $('rows').addEventListener('dblclick', (e) => {
    const key = ((e.target as HTMLElement).closest('tr') as HTMLElement | null)?.dataset.key;
    const i = issues.find((x) => x.key === key);
    if (i) inExtension ? api.tabs.create({ url: i.url }) : open(i.url);
  });
  for (const th of document.querySelectorAll<HTMLElement>('th[data-sort]')) {
    th.onclick = () => {
      const k = th.dataset.sort!;
      if (sortKey === k) sortDir = sortDir === 1 ? -1 : 1;
      else { sortKey = k; sortDir = k === 'resolved' || k === 'comments' ? -1 : 1; }
      render();
    };
  }

  $('btnExport').onclick = openExport;
  $('btnCopyAi').onclick = openAiWithTable;
  for (const b of document.querySelectorAll<HTMLElement>('.tabs button')) b.onclick = () => showTab(b.dataset.tab as 'detail' | 'ai');
  initAi(showTab);
  for (const b of document.querySelectorAll<HTMLElement>('#format button')) b.onclick = () => setFormat(b.dataset.v as typeof format);
  $('exportSave').onclick = () => {
    download(exportText(format, exportOptions()), fileName(lastLogin, format), MIME[format]);
    $<HTMLDialogElement>('dlgExport').close();
  };
  $('exportCopy').onclick = () => copyText(exportText(format, exportOptions()), 'Скопировано');

  $('btnSettings').onclick = openSettings;
  $('updBadge').onclick = openSettings;
  $('btnUpdCheck').onclick = () => checkForUpdate(true);
  $('btnUpdGet').onclick = downloadUpdate;
  $('btnUpdReload').onclick = reloadExtension;
  $('assigneeAttr').addEventListener('change', () => {
    assigneeAttr = $<HTMLSelectElement>('assigneeAttr').value;
    store.set('assigneeAttr', assigneeAttr);
    onFormChange();
  });
  $('btnTokenSave').onclick = () => saveToken($<HTMLInputElement>('token').value);
  $('btnTokenClear').onclick = () => { $<HTMLInputElement>('token').value = ''; saveToken(''); };
  $('btnProfile').onclick = () => openYt('/users/me?tab=account-security');
  $('btnOpenYt').onclick = () => openYt();
  $('btnTheme').onclick = () => {
    theme = THEMES[(THEMES.indexOf(theme as typeof THEMES[number]) + 1) % THEMES.length];
    applyTheme(theme);
    store.set('theme', theme);
  };

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); openExport(); return; }
    const t = e.target as HTMLElement;
    if (t.matches('input, textarea, select') || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = visible();
      if (!list.length) return;
      e.preventDefault();
      const k = list.findIndex((i) => i.key === selected);
      const next = e.key === 'ArrowDown' ? Math.min(list.length - 1, k + 1) : Math.max(0, k - 1);
      select(list[next].key);
    }
  });

  checkForUpdate(false);
  await connect();
}

init();
