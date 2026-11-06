// Страница YouTrack Reports: выбор исполнителя, поиск задач, детали, выгрузка и ИИ-чат.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ExternalLinkIcon, FileDownIcon, ListIcon, MoonIcon, SettingsIcon, SparklesIcon, SunIcon, SunMoonIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { api, inExtension, PLATFORM, VERSION, YOUTRACK, YOUTRACK_MATCH } from '../shared';
import { checkUpdate, isNewer, isStale, type UpdateState } from '../core/update';
import {
  attachBoards, badParts, boardIssueKeys, dropEach, findAssigneeAttr, isParseError, knownStates, listBoards, listProjects, listTags, listUsers, me,
  queryParts, searchIssues, withoutPeriod, type Board, type Issue, type Project, type Signal, type User, type YtError,
} from '../core/youtrack';
import { findParticipation, issuesByKeys } from '../core/participation';
import { fileName, toCSV, toJSON, toMarkdown, toTxt, type ExportMeta, type ExportOptions } from '../core/export';
import { periodLabel, presetRange, type Preset } from '../core/period';
import { uniqSorted } from '../core/suggest';
import { store } from './lib/storage';
import { copyText, download, getToken, hasYtPerm, num, openUrl, openYt, setToken, yt } from './lib/net';
import { boardLabel, boardOf, defaultForm, formQuery, loginOf, queryOptions, restoreForm, sprintOf, type Form } from './lib/form';
import { Filters } from './components/Filters';
import { IssueTable, type SortKey } from './components/IssueTable';
import { IssueDetail } from './components/IssueDetail';
import { AiPanel, type AiData } from './components/AiPanel';
import { ExportDialog, type Format } from './components/ExportDialog';
import { SettingsDialog } from './components/SettingsDialog';

interface NoticeState { kind: 'warn' | 'err'; body: ReactNode; buttons: { label: string; run: () => void }[] }
type Theme = '' | 'light' | 'dark';

const THEMES: Theme[] = ['', 'light', 'dark'];
const THEME_NAMES: Record<Theme, string> = { '': 'как в системе', light: 'светлая', dark: 'тёмная' };
const MIME: Record<Format, string> = { txt: 'text/plain;charset=utf-8', md: 'text/markdown;charset=utf-8', json: 'application/json;charset=utf-8', csv: 'text/csv;charset=utf-8' };
const PART_NAMES = { project: 'Проект', assignee: 'Исполнитель', state: 'Статус', type: 'Тип', tag: 'Тег', period: 'Период', extra: 'Запрос' };
const many = (n: number) => (n >= 100 ? '100+' : num(n));
const C = ({ children }: { children: ReactNode }) => <code>{children}</code>;

export function App() {
  // ---------- Настройки и списки ----------
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<Form>(defaultForm);
  const [assigneeAttr, setAssigneeAttr] = useState('assignee');
  const [team, setTeam] = useState<string[]>([]);
  const [format, setFormat] = useState<Format>('md');
  const [theme, setTheme] = useState<Theme>('');
  const [users, setUsers] = useState<User[]>([]);
  const [usersFailed, setUsersFailed] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);

  // ---------- Запрос и результаты ----------
  const [queryText, setQueryText] = useState('');
  const [queryEdited, setQueryEdited] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [meta, setMeta] = useState<ExportMeta | null>(null);
  const [lastLogin, setLastLogin] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('resolved');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'detail' | 'ai'>('detail');
  const [aiRequest, setAiRequest] = useState<{ data: AiData; n: number } | null>(null);

  // ---------- Состояние страницы ----------
  const [conn, setConn] = useState<{ state: 'ok' | 'err' | 'busy'; text: string }>({ state: 'busy', text: 'Подключение…' });
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [progress, setProgress] = useState<{ text: string; part: number } | null>(null);
  const [stopShow, setStopShow] = useState<(() => void) | null>(null);
  const running = useRef<Signal | null>(null);
  const [searching, setSearching] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('');
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [updBusy, setUpdBusy] = useState(false);

  // Последние значения — для обработчиков, вызванных позже (кнопки уведомлений, клавиатура)
  const latest = useRef({ form, users, boards, assigneeAttr, queryText, queryEdited });
  latest.current = { form, users, boards, assigneeAttr, queryText, queryEdited };

  const login = loginOf(form.assignee, users);
  const userName = useCallback((l: string) => users.find((u) => u.login === l)?.name || l, [users]);
  const query = queryEdited ? queryText : formQuery(form, users, assigneeAttr);

  // ---------- Загрузка настроек ----------
  useEffect(() => {
    (async () => {
      setToken(await store.get('token', ''));
      setAssigneeAttr(await store.get('assigneeAttr', 'assignee'));
      setTeam(await store.get<string[]>('team', []));
      setFormat(await store.get<Format>('format', 'md'));
      setTheme(await store.get<Theme>('theme', ''));
      setForm(restoreForm(await store.get<any>('form', null)));
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready) store.set('form', form); }, [form, ready]);

  const updateForm = useCallback((patch: Partial<Form>) => {
    setForm((f) => {
      const n = { ...f, ...patch };
      if (patch.preset && patch.preset !== 'custom') Object.assign(n, presetRange(patch.preset as Preset));
      return n;
    });
    if (patch.mode) setQueryEdited(false);
  }, []);

  // ---------- Тема ----------
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === '' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // ---------- Уведомления ----------
  const showError = useCallback((e: unknown, retry: () => void) => {
    const err = e as YtError;
    if (err.kind === 'auth' && err.status !== 403) {
      setConn({ state: 'err', text: 'Нет входа' });
      setNotice({
        kind: 'warn',
        body: <p><b>Нужен вход в YouTrack.</b> Откройте youtrack.office.lan, войдите и нажмите «Повторить». Если не помогает — укажите постоянный токен в «Настройках».</p>,
        buttons: [
          { label: 'Открыть YouTrack', run: () => openYt() },
          { label: 'Указать токен', run: () => setSettingsOpen(true) },
          { label: 'Повторить', run: retry },
        ],
      });
    } else {
      setNotice({ kind: 'err', body: <p><b>Ошибка:</b> {err.message || String(e)}</p>, buttons: [{ label: 'Повторить', run: retry }] });
    }
  }, []);

  // ---------- Подключение ----------
  const connect = useCallback(async function connectNow() {
    setNotice(null);
    if (!(await hasYtPerm())) {
      setConn({ state: 'err', text: 'Нет доступа' });
      setNotice({
        kind: 'warn',
        body: <p><b>Нужно разрешение на доступ к youtrack.office.lan.</b> Нажмите «Разрешить доступ» и подтвердите запрос браузера.</p>,
        buttons: [{
          label: 'Разрешить доступ',
          run: async () => {
            if (await api.permissions.request({ origins: [YOUTRACK_MATCH] }).catch(() => false)) return connectNow();
            setNotice({
              kind: 'warn',
              body: <p><b>Доступ не выдан.</b> Если запрос не появился — Chrome: <C>chrome://extensions</C> → YouTrack Reports → «Подробнее» → «Доступ к сайтам» → добавьте https://youtrack.office.lan (или «На всех сайтах»); если YouTrack Reports обновляли — нажмите там ⟳. Firefox: <C>about:addons</C> → YouTrack Reports → «Разрешения». YouTrack Reports продолжит сам.</p>,
              buttons: [{ label: 'Повторить', run: connectNow }],
            });
          },
        }],
      });
      // Разрешение выдали в about:addons — подключиться без перезагрузки
      try { api.permissions.onAdded.addListener(function once(p: any) { if ((p?.origins || []).includes(YOUTRACK_MATCH)) { api.permissions.onAdded.removeListener(once); connectNow(); } }); } catch { /* нет onAdded */ }
      return;
    }
    setConn({ state: 'busy', text: 'Подключение…' });
    try {
      const u = await me(yt);
      setConn({ state: 'ok', text: u.name + (getToken() ? ' · токен' : '') });
    } catch (e) {
      showError(e, connectNow);
      return;
    }
    // Списки для подсказок: без прав на них просто вводите логин вручную
    listUsers(yt).then(setUsers).catch(() => setUsersFailed(true));
    listProjects(yt).then(setProjects).catch(() => {});
    listBoards(yt).then((bs) => setBoards(bs.sort((a, b) => a.name.localeCompare(b.name, 'ru')))).catch(() => {});
    listTags(yt).then((ts) => setTags((t) => uniqSorted([...t, ...ts]))).catch(() => {}).finally(() => setTagsLoaded(true));
  }, [showError]);

  useEffect(() => { if (ready) connect(); }, [ready, connect]);

  // Статусы проекта — для выбора в «Статусе»
  useEffect(() => {
    if (!ready || conn.state !== 'ok') return;
    const t = setTimeout(() => { knownStates(yt, form.project).then((s) => { if (s.length) setStates(s); }).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [ready, conn.state, form.project]);

  // ---------- Обновления ----------
  const checkForUpdate = useCallback(async (force: boolean) => {
    const prev = await store.get<UpdateState | null>('update', null);
    setUpdate(prev);
    if (!force && !isStale(prev)) return;
    setUpdBusy(true);
    const next = await checkUpdate(PLATFORM, prev);
    await store.set('update', next);
    setUpdate(next);
    setUpdBusy(false);
  }, []);
  useEffect(() => { checkForUpdate(false); }, [checkForUpdate]);
  const fresh = !!update?.latest && isNewer(update.latest.version, VERSION);

  const openSettings = () => {
    setSettingsStatus(getToken() ? 'Сейчас используется токен.' : 'Сейчас используется сессия браузера.');
    setSettingsOpen(true);
    if (!updBusy) checkForUpdate(false);
  };

  const saveToken = async (value: string) => {
    const t = value.trim();
    setToken(t);
    await store.set('token', t);
    setSettingsStatus('Проверка…');
    try {
      const u = await me(yt);
      setSettingsStatus(`✓ Вход выполнен: ${u.name} (${u.login})`);
      connect();
    } catch (e) {
      setSettingsStatus('✕ ' + (e as Error).message);
    }
  };

  // ---------- Почему пусто / почему YouTrack не понял ----------
  const knownStatesNote = async (project: string) => {
    const s = await knownStates(yt, project).catch(() => [] as string[]);
    if (s.length) setStates(s);
    return s.length ? <>Статусы у задач{project ? ' проекта ' + project : ''}: {s.map((x, i) => <span key={x}>{i ? ', ' : ''}<C>{x}</C></span>)}</> : null;
  };

  // search объявлен ниже; ссылка — чтобы кнопки уведомлений запускали актуальную версию
  const searchRef = useRef<(o?: { form?: Form; attr?: string }) => void>(() => {});

  const explainParseError = async (q: string, f: Form, attr: string, edited: boolean) => {
    const retry = { label: 'Повторить', run: () => searchRef.current() };
    if (edited) {
      setNotice({ kind: 'err', body: <p><b>YouTrack не понял запрос:</b> <C>{q}</C>. Проверьте его в строке поиска YouTrack или нажмите «Из полей» в «Запросе YouTrack».</p>, buttons: [retry] });
      return;
    }
    setNotice({ kind: 'warn', body: <p>YouTrack не понял запрос — проверяю, какая часть…</p>, buttons: [] });
    const opts = queryOptions(f, latest.current.users, attr);
    const bad = await badParts(yt, queryParts(opts));
    const hints: ReactNode[] = [];
    if (bad.some((x) => x.what === 'state')) { const n = await knownStatesNote(opts.project || ''); if (n) hints.push(<p key="s">{n} — выберите в поле «Статус».</p>); }
    if (bad.some((x) => x.what === 'assignee')) hints.push(<p key="a">Исполнителя с таким логином YouTrack не знает — выберите его из списка.</p>);
    if (bad.some((x) => x.what === 'project')) hints.push(<p key="p">Проекта с таким ключом нет — выберите его из списка.</p>);
    setNotice({
      kind: 'err',
      body: bad.length
        ? <><p><b>YouTrack не понял часть запроса:</b></p><ul className="list-disc pl-5">{bad.map((x) => <li key={x.text}><b>{PART_NAMES[x.what]}:</b> <C>{x.text}</C></li>)}</ul>{hints}</>
        : <p><b>YouTrack не понял запрос:</b> <C>{q}</C>, хотя каждая часть по отдельности верна.</p>,
      buttons: [retry],
    });
  };

  const explainEmpty = async (q: string, f: Form, attr: string, edited: boolean) => {
    const opts = queryOptions(f, latest.current.users, attr);
    const parts = queryParts(opts);
    const toYt = { label: 'Открыть запрос в YouTrack', run: () => openYt('/issues?q=' + encodeURIComponent(q)) };
    if (edited || parts.length < 2) return;
    setNotice({ kind: 'warn', body: <p>Ничего не найдено — проверяю, какое условие отсекает задачи…</p>, buttons: [] });
    const rerun = (patch: Partial<Form>, a = attr) => () => {
      const nf = { ...f, ...patch };
      if (patch.preset && patch.preset !== 'custom') Object.assign(nf, presetRange(patch.preset as Preset));
      setForm(nf);
      searchRef.current({ form: nf, attr: a });
    };
    const items: ReactNode[] = [], buttons: NoticeState['buttons'] = [];
    const drops = await dropEach(yt, parts);
    for (const { part, found } of drops) {
      if (found > 0) items.push(<li key={part.text}>без условия «{PART_NAMES[part.what]}» <C>{part.text}</C> — задач: {many(found)}</li>);
    }
    const culprit = (w: string) => drops.some((d) => d.part.what === w && d.found > 0);
    if (culprit('assignee')) {
      const alt = await findAssigneeAttr(yt, opts);
      if (alt) {
        items.push(<li key="alt"><b>С условием <C>{alt.attr}: {'{'}{opts.assignee}{'}'}</C> находится задач: {many(alt.found)}</b> — «{opts.assigneeAttr || 'assignee'}:» в вашем YouTrack ищет не по полю «Исполнитель».</li>);
        buttons.push({ label: `Искать через «${alt.attr}:»`, run: () => { setAssigneeAttr(alt.attr); store.set('assigneeAttr', alt.attr); rerun({}, alt.attr)(); } });
      } else {
        items.push(<li key="login">Проверьте логин <C>{opts.assignee}</C> — выберите исполнителя из выпадающего списка.</li>);
      }
    }
    if (culprit('period')) {
      if (opts.dateField === 'resolved') {
        const r = await withoutPeriod(yt, parts).catch(() => null);
        if (r && r.found && !r.anyResolved) items.push(<li key="nores">У этих задач <b>нет даты решения</b> — статус «{opts.states}» в YouTrack не считается «решённым».</li>);
      }
      if (opts.dateField !== 'updated') buttons.push({ label: 'По дате обновления', run: rerun({ dateField: 'updated' }) });
      buttons.push({ label: 'Всё время', run: rerun({ preset: 'all' }) });
    }
    if (culprit('state')) { const n = await knownStatesNote(opts.project || ''); if (n) items.push(<li key="st">{n}</li>); }
    if (!items.length) {
      setNotice({ kind: 'warn', body: <p><b>Ничего не найдено</b>, и ни одно условие по отдельности не виновато — задач с таким сочетанием нет. Проверьте запрос в YouTrack: <C>{q}</C></p>, buttons: [toYt] });
      return;
    }
    setNotice({ kind: 'warn', body: <><p><b>Ничего не найдено.</b> Вот что удалось выяснить:</p><ul className="list-disc pl-5">{items}</ul></>, buttons: [...buttons, toYt] });
  };

  // ---------- Поиск ----------
  const search = async (o: { form?: Form; attr?: string } = {}) => {
    const cur = latest.current;
    const f = o.form ?? cur.form;
    const attr = o.attr ?? cur.assigneeAttr;
    const edited = !o.form && cur.queryEdited;
    const q = (edited ? cur.queryText : formQuery(f, cur.users, attr)).trim();
    const who = loginOf(f.assignee, cur.users);
    const byRole = f.mode === 'participant';
    const board = boardOf(f, cur.boards);
    const label = boardLabel(f, cur.boards);
    if (f.board && !board) return void toast(cur.boards.length ? 'Такой доски нет — выберите из списка' : 'Список досок ещё не загружен');
    if (!who && (byRole || (!edited && !board))) return void toast(byRole ? 'Выберите сотрудника' : 'Выберите сотрудника или доску');
    // История изменений просматривается по всем задачам фильтра — без фильтра это весь YouTrack
    if (byRole && !q) return void toast('Для поиска по участию укажите период или проект');
    if (running.current) running.current.cancelled = true;
    const signal: Signal = { cancelled: false };
    running.current = signal;
    setNotice(null);
    setSearching(true);
    setProgress({ text: 'Загрузка задач…', part: 0.05 });
    const prog = (text: string, part: number) => { if (running.current === signal) setProgress({ text, part }); };
    let stoppedNote: ReactNode = null;
    try {
      let found: Issue[];
      // Задачи доски: у задачи в REST нет поля «доска» — берём их из спринтов доски
      let boardKeys: Set<string> | null = null;
      if (board) {
        prog('Задачи доски…', 0.05);
        boardKeys = await boardIssueKeys(yt, board, sprintOf(f, cur.boards), { signal, onProgress: (d, t) => prog(`Задачи доски: спринт ${d} из ${t}`, 0.05 + 0.15 * d / t) });
        if (signal.cancelled) return;
      }
      if (byRole) {
        // «Показать найденное» — остановить проверку истории и показать то, что уже нашлось
        const stop = { requested: false };
        setStopShow(() => () => { stop.requested = true; setStopShow(null); prog('Останавливаюсь, собираю найденное…', 0.7); });
        let r;
        try {
          r = await findParticipation(yt, q, who, { assigneeAttr: attr, wide: f.wide, signal, stop, onProgress: (t, part) => { if (!stop.requested) prog(t, part); } });
        } finally {
          setStopShow(null);
        }
        if (r.stopped) {
          stoppedNote = r.mode === 'stream'
            ? <p><b>Остановлено:</b> просмотрено {num(r.scanned)} записей истории фильтра. В таблице — что нашлось к этому моменту и все задачи, где сотрудник исполнитель сейчас.</p>
            : <p><b>Остановлено:</b> история проверена у {num(r.checked)} из {num(Math.min(r.all, r.limit))} задач фильтра. В таблице — задачи из проверенной части и все, где сотрудник исполнитель сейчас.</p>;
        } else if (r.truncated) {
          stoppedNote = <p><b>В фильтре больше {num(r.limit)} задач</b> — история просмотрена только у первых {num(r.limit)}. Укажите проект (а при необходимости тип и тег) или сузьте период.</p>;
        }
        const keys = [...r.roles.keys()];
        prog(`Загрузка задач: 0 из ${num(keys.length)}…`, 0.72);
        found = await issuesByKeys(yt, YOUTRACK, keys, { signal, onProgress: (n) => prog(`Загрузка задач: ${num(n)} из ${num(keys.length)}…`, 0.72 + 0.1 * n / Math.max(1, keys.length)) });
        for (const i of found) i.roles = r.roles.get(i.key) || [];
      } else if (boardKeys && !who) {
        // Без сотрудника — задачи доски по остальным условиям запроса
        const keys = [...boardKeys];
        found = await issuesByKeys(yt, YOUTRACK, keys, { signal, query: q, onProgress: (n) => prog(`Задачи доски (${num(keys.length)}): подходят ${num(n)}…`, 0.3) });
      } else {
        found = await searchIssues(yt, YOUTRACK, q, { signal, onProgress: (n) => prog(`Загружено задач: ${num(n)}…`, 0.3) });
      }
      if (boardKeys) found = found.filter((i) => boardKeys!.has(i.key));
      if (f.withBoards && found.length) {
        const from = byRole ? 0.82 : 0.4;
        prog('Определяю доски…', from);
        await attachBoards(yt, found, { signal, onProgress: (d, t) => prog(`Доски: ${d} из ${t}`, from + (1 - from) * d / t) });
      }
      if (signal.cancelled) return;
      const dfLabel = { resolved: 'решения', updated: 'обновления', created: 'создания' }[f.dateField];
      setIssues(found);
      setTags((t) => uniqSorted([...t, ...found.flatMap((i) => i.tags)]));
      setExcluded(new Set());
      setLastLogin(who);
      setSelected('');
      setMeta({
        assignee: who ? `${userName(who)} (${who})${byRole ? ', участие в задачах' : ''}` : board ? `все задачи доски «${label}»` : 'по запросу',
        query: board ? `${q} + доска «${label}»` : q,
        period: periodLabel(f.from, f.to) ? `${periodLabel(f.from, f.to)} (по дате ${dfLabel})` : undefined,
        generated: Date.now(),
      });
      if (!found.length && boardKeys) {
        setNotice({
          kind: 'warn', buttons: [],
          body: boardKeys.size
            ? <p><b>Ничего не найдено.</b> На доске «{label}» {num(boardKeys.size)} задач, но ни одна не подходит под остальные условия — расширьте период или уберите статус.</p>
            : <p><b>На доске «{label}» нет задач</b> (или нет доступа к её спринтам).</p>,
        });
      } else if (!found.length && !byRole) await explainEmpty(q, f, attr, edited);
      if (!found.length && byRole) setNotice({ kind: 'warn', buttons: [], body: <p><b>Ничего не найдено.</b> Сотрудник не был исполнителем, не менял и не комментировал задачи этого фильтра. Попробуйте расширить период или убрать статус.</p> });
      if (stoppedNote) setNotice({ kind: 'warn', buttons: [], body: stoppedNote });
    } catch (e) {
      if (signal.cancelled) return;
      if (isParseError(e)) await explainParseError(q, f, attr, edited).catch((e2) => showError(e2, () => searchRef.current()));
      else showError(e, () => searchRef.current());
    } finally {
      if (running.current === signal) {
        running.current = null;
        setProgress(null);
        setSearching(false);
      }
    }
  };
  searchRef.current = search;
  const runSearch = () => searchRef.current();

  const cancel = () => {
    if (running.current) running.current.cancelled = true;
    running.current = null;
    setProgress(null);
    setSearching(false);
  };

  // ---------- Таблица ----------
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = issues;
    if (q) list = list.filter((i) => [i.key, i.summary, i.project, i.tags.join(' '), i.boards.join(' '), i.description].some((s) => s.toLowerCase().includes(q)));
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
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sortDir; });
  }, [issues, filter, sortKey, sortDir]);
  const checked = useMemo(() => visible.filter((i) => !excluded.has(i.key)), [visible, excluded]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === 'resolved' || k === 'comments' ? -1 : 1); }
  };
  const select = (key: string) => { setSelected(key); setTab('detail'); };
  const openIssue = (i: Issue) => openUrl(i.url);

  // ---------- ИИ и выгрузка ----------
  const openAi = () => {
    if (!checked.length || !meta) return;
    const list = checked;
    const m = { ...meta, generated: Date.now() };
    setAiRequest((r) => ({
      n: (r?.n ?? 0) + 1,
      data: {
        label: m.assignee + (m.period ? ' · ' + m.period : ''),
        count: list.length,
        person: { login: lastLogin, name: lastLogin ? `${userName(lastLogin)} (${lastLogin})` : m.assignee },
        period: m.period,
        build: (o) => toMarkdown(list, m, { description: o.description, comments: o.comments }),
      },
    }));
    setTab('ai');
  };

  const exportText = (fmt: Format, o: ExportOptions) => {
    const m = { ...meta!, generated: Date.now() };
    return fmt === 'md' ? toMarkdown(checked, m, o) : fmt === 'json' ? toJSON(checked, m, o) : fmt === 'txt' ? toTxt(checked) : toCSV(checked, o);
  };
  const openExport = () => { if (checked.length) setExportOpen(true); };

  // ---------- Клавиатура ----------
  const keys = useRef({ openExport, visible, selected });
  keys.current = { openExport, visible, selected };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); k.openExport(); return; }
      const t = e.target as HTMLElement;
      if (t.matches('input, textarea, select, [role=combobox], [contenteditable]') || document.querySelector('[role=dialog], [data-radix-popper-content-wrapper]')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!k.visible.length) return;
        e.preventDefault();
        const i = k.visible.findIndex((x) => x.key === k.selected);
        const next = e.key === 'ArrowDown' ? Math.min(k.visible.length - 1, i + 1) : Math.max(0, i - 1);
        setSelected(k.visible[next].key);
        setTab('detail');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ---------- Разметка ----------
  const label = boardLabel(form, boards);
  const queryNote = (queryEdited ? '· изменён вручную' : '') + (form.mode === 'participant' ? ' · фильтр задач; участие сотрудника проверяется по истории' : '')
    + (label ? ` · и только задачи доски «${label}»` : '');
  const summary = !meta ? 'Выберите исполнителя или доску и нажмите «Найти»'
    : `${meta.assignee}: найдено ${num(issues.length)}` + (visible.length !== issues.length ? ` · показано ${num(visible.length)}` : '') + ` · отмечено ${num(checked.length)}`;
  const empty = !meta ? 'Выберите исполнителя или доску и нажмите «Найти»' : issues.length ? 'Ничего не подходит под фильтр' : 'Задач не найдено. Проверьте статус, период и запрос YouTrack.';
  const ThemeIcon = theme === 'dark' ? MoonIcon : theme === 'light' ? SunIcon : SunMoonIcon;

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-hidden p-2.5 max-[900px]:overflow-auto">
      <header className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2 text-[15px] font-bold">
          <img src="icons/icon32.png" alt="" width={20} height={20} /> YouTrack Reports
          <span className="text-xs font-normal text-muted-foreground">{inExtension ? 'v' + VERSION : 'тестовые данные'}</span>
          {fresh && update?.latest && (
            <button className="rounded-full border border-primary/35 bg-selected px-2 text-[11px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
              title="Открыть настройки, чтобы обновить" onClick={openSettings}>↑ {update.latest.version}</button>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
          <span className={cn('size-2 rounded-full', conn.state === 'ok' && 'bg-ok', conn.state === 'err' && 'bg-destructive', conn.state === 'busy' && 'animate-pulse bg-warn')} />
          {conn.text}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => openYt()} title="Открыть YouTrack в новой вкладке"><ExternalLinkIcon /> YouTrack</Button>
        <Button variant="outline" size="sm" onClick={openSettings} title="Версия, вход и токен"><SettingsIcon /> Настройки</Button>
        <Button variant="outline" size="icon" className="size-8" title={`Тема: ${THEME_NAMES[theme]} (щёлкните, чтобы сменить)`}
          onClick={() => { const t = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; setTheme(t); store.set('theme', t); }}>
          <ThemeIcon />
        </Button>
      </header>

      {notice && (
        <div className={cn('flex flex-wrap items-center gap-3 rounded-lg px-3.5 py-2.5 [&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_p+p]:mt-1 [&_ul]:my-1',
          notice.kind === 'err' ? 'bg-destructive/10 text-destructive' : 'bg-warn-bg text-warn')}>
          <div className="min-w-0 flex-1">{notice.body}</div>
          <div className="flex flex-wrap gap-1.5">
            {notice.buttons.map((b) => <Button key={b.label} variant="outline" size="sm" className="text-foreground" onClick={b.run}>{b.label}</Button>)}
            <Button variant="ghost" size="icon" className="size-8 text-foreground" title="Скрыть" onClick={() => setNotice(null)}><XIcon /></Button>
          </div>
        </div>
      )}

      <Filters form={form} update={updateForm} users={users} usersFailed={usersFailed} projects={projects} boards={boards} states={states}
        tags={tags} tagsLoaded={tagsLoaded} team={team} login={login} userName={userName}
        onStar={() => {
          if (!login) return void toast('Сначала выберите исполнителя');
          const t = team.includes(login) ? team.filter((x) => x !== login) : [...team, login];
          setTeam(t); store.set('team', t);
        }}
        onTeamPick={(l) => { const nf = { ...form, assignee: l }; setForm(nf); searchRef.current({ form: nf }); }}
        onTeamRemove={(l) => { const t = team.filter((x) => x !== l); setTeam(t); store.set('team', t); }}
        query={query} queryEdited={queryEdited} queryNote={queryNote}
        onQuery={(q) => { setQueryText(q); setQueryEdited(true); }} onQueryReset={() => setQueryEdited(false)}
        searching={searching} onSearch={runSearch} />

      <main className="flex min-h-0 flex-1 gap-2.5 max-[900px]:flex-col">
        <section className="flex min-w-0 flex-[1_1_60%] flex-col overflow-hidden rounded-lg border bg-card max-[900px]:min-h-[60vh]">
          <div className="flex flex-wrap items-center gap-2 border-b px-2.5 py-2">
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={summary}>{summary}</span>
            <Input className="h-8 w-48" placeholder="Фильтр по найденным…" autoComplete="off" spellCheck={false} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Button variant="outline" size="sm" disabled={!checked.length} onClick={openAi} title="Открыть чат с моделью: отмеченные задачи и инструкция для отчёта уже подставлены">
              <SparklesIcon /> Для ИИ
            </Button>
            <Button size="sm" disabled={!checked.length} onClick={openExport} title="Выгрузить отмеченные задачи (Ctrl+S)"><FileDownIcon /> Выгрузить…</Button>
          </div>
          {progress && (
            <div className="relative flex items-center gap-2.5 border-b px-2.5 py-1.5 text-xs">
              <div className="absolute bottom-[-1px] left-0 h-0.5 bg-primary transition-[width] duration-200" style={{ width: Math.round(progress.part * 100) + '%' }} />
              <span>{progress.text}</span>
              <div className="flex-1" />
              {stopShow && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={stopShow} title="Остановить проверку истории и показать задачи, найденные к этому моменту">Показать найденное</Button>}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancel} title="Прервать поиск">Отмена</Button>
            </div>
          )}
          <IssueTable list={visible} excluded={excluded} selected={selected} sortKey={sortKey} sortDir={sortDir} withRoles={issues.some((i) => i.roles.length > 0)}
            empty={empty} onSort={onSort} onSelect={select} onOpen={openIssue}
            onToggle={(key, on) => setExcluded((s) => { const n = new Set(s); on ? n.delete(key) : n.add(key); return n; })}
            onToggleAll={(on) => setExcluded((s) => { const n = new Set(s); for (const i of visible) on ? n.delete(i.key) : n.add(i.key); return n; })} />
        </section>

        <aside className="flex min-w-80 flex-[0_0_40%] flex-col overflow-hidden rounded-lg border bg-card max-[900px]:min-h-[70vh] max-[900px]:min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'detail' | 'ai')} className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="border-b px-2 pt-2 pb-1.5">
              <TabsList className="h-8">
                <TabsTrigger value="detail" className="text-xs"><ListIcon /> Детали</TabsTrigger>
                <TabsTrigger value="ai" className="text-xs"><SparklesIcon /> ИИ</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="detail" className="min-h-0 flex-1"><IssueDetail issue={issues.find((i) => i.key === selected) ?? null} /></TabsContent>
            {/* ИИ не размонтируется при переключении — разговор сохраняется */}
            <div className={cn('min-h-0 flex-1', tab !== 'ai' && 'hidden')}><AiPanel request={aiRequest} shown={tab === 'ai'} /></div>
          </Tabs>
        </aside>
      </main>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} format={format}
        count={`Будет выгружено задач: ${num(checked.length)} (отмеченные галочкой${filter ? ' и подходящие под фильтр' : ''}).`}
        onFormat={(f) => { setFormat(f); store.set('format', f); }}
        onCopy={async (o) => toast(await copyText(exportText(format, o)) ? '✓ Скопировано' : 'Не удалось скопировать')}
        onSave={(o) => { download(exportText(format, o), fileName(lastLogin, format), MIME[format]); setExportOpen(false); }} />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} token={getToken()} status={settingsStatus} onSaveToken={saveToken}
        assigneeAttr={assigneeAttr} onAssigneeAttr={(v) => { setAssigneeAttr(v); store.set('assigneeAttr', v); }}
        onProfile={() => openYt('/users/me?tab=account-security')}
        update={update} updBusy={updBusy} onCheckUpdate={() => checkForUpdate(true)}
        onDownloadUpdate={() => { const url = update?.latest?.download; if (url) openUrl(url, false); }}
        onReload={async () => { await store.set('reopenAfterUpdate', true); api.runtime.reload(); }} />
    </div>
  );
}
