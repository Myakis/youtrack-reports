// Настройки по разделам: оформление (темы), подключение (токен, как искать исполнителя), обновления с GitHub.
import { useEffect, useState } from 'react';
import { CheckIcon, DownloadIcon, ExternalLinkIcon, HistoryIcon, KeyRoundIcon, PaletteIcon, RefreshCwIcon, RotateCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { inExtension, PLATFORM, VERSION } from '../../shared';
import { isNewer, type UpdateState } from '../../core/update';
import { md } from '../md';
import { releaseNotesOnly } from '../../core/changelog';
import { THEMES, type ThemeId, type ThemeInfo } from '../lib/themes';
import { SCALE_MAX, SCALE_MIN, type ColumnsConfig, type Density } from '../lib/view';
import { ColumnsEditor } from './ColumnsEditor';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type SettingsSection = 'look' | 'connect' | 'updates';

const SECTIONS: { id: SettingsSection; name: string; icon: React.ReactNode }[] = [
  { id: 'look', name: 'Оформление', icon: <PaletteIcon /> },
  { id: 'connect', name: 'Подключение', icon: <KeyRoundIcon /> },
  { id: 'updates', name: 'Обновления', icon: <RefreshCwIcon /> },
];

/** Макет приложения в цветах темы: шапка, фильтры, таблица и панель деталей. */
function Mock({ dark, theme }: { dark: boolean; theme?: string }) {
  const line = (w: string, c = 'bg-muted') => <span className={cn('block h-1 rounded-full', w, c)} />;
  return (
    <div className={cn(dark ? 'dark' : 'light', 'flex h-full flex-col gap-1 bg-background p-1.5')} data-theme={theme}>
      <div className="flex items-center justify-between">{line('w-5', 'bg-primary')}{line('w-3', 'bg-primary/70')}</div>
      <div className="flex gap-1 rounded-sm border bg-card p-1">{line('w-4', 'bg-primary/60')}{line('w-4', 'bg-destructive/50')}<span className="flex-1" />{line('w-3', 'bg-primary')}</div>
      <div className="flex flex-1 gap-1">
        <div className="flex flex-[3] flex-col gap-1 rounded-sm border bg-card p-1">
          {line('w-full', 'bg-board-bg')}{line('w-4/5')}{line('w-full', 'bg-selected')}{line('w-3/5')}
        </div>
        <div className="flex flex-[2] flex-col gap-1 rounded-sm border bg-card p-1">
          {line('w-4/5')}{line('w-3/5', 'bg-primary/50')}{line('w-4/5', 'bg-ok/60')}
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ t, active, onPick }: { t: ThemeInfo; active: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={active} className="group flex flex-col gap-1.5 text-left">
      <span className={cn('relative block aspect-[16/10] overflow-hidden rounded-lg border-2 transition-colors',
        active ? 'border-primary ring-2 ring-primary/25' : 'border-border group-hover:border-primary/50')}>
        {t.dark === 'system' ? (
          <>
            <span className="absolute inset-0"><Mock dark={false} /></span>
            <span className="absolute inset-0 [clip-path:polygon(62%_0,100%_0,100%_100%,48%_100%)]"><Mock dark /></span>
          </>
        ) : <span className="absolute inset-0"><Mock dark={t.dark} theme={t.id || undefined} /></span>}
        {active && <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5 text-primary-foreground"><CheckIcon className="size-3" /></span>}
      </span>
      <span className={cn('text-[0.8125rem]', active ? 'font-semibold text-primary' : 'text-foreground')}>{t.name}</span>
    </button>
  );
}

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  status: string;
  onSaveToken: (token: string) => void;
  assigneeAttr: string;
  onAssigneeAttr: (v: string) => void;
  onProfile: () => void;
  update: UpdateState | null;
  updBusy: boolean;
  onCheckUpdate: () => void;
  onDownloadUpdate: () => void;
  onReload: () => void;
  /** Показать историю изменений (встроенный CHANGELOG). */
  onHistory: () => void;
  theme: ThemeId;
  onTheme: (t: ThemeId) => void;
  density: Density;
  onDensity: (d: Density) => void;
  scale: number;
  onScale: (v: number) => void;
  columns: ColumnsConfig;
  onColumns: (c: ColumnsConfig) => void;
  /** С какого раздела открыть. */
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
}

export function SettingsDialog(p: SettingsDialogProps) {
  const [token, setToken] = useState(p.token);
  useEffect(() => { if (p.open) setToken(p.token); }, [p.open, p.token]);

  const latest = p.update?.latest;
  const fresh = !!latest && isNewer(latest.version, VERSION);
  const updStatus = p.updBusy ? 'Проверка…'
    : p.update?.error ? `✕ ${p.update.error}`
    : !p.update ? ''
    : !latest ? 'Релизов на GitHub пока нет.'
    : fresh ? `Доступна версия ${latest.version}.`
    : `✓ Это последняя версия (проверено ${new Date(p.update.checkedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}).`;

  const title = (t: string, d?: string) => (
    <div className="mb-3">
      <DialogTitle className="text-base">{t}</DialogTitle>
      {d && <DialogDescription className="mt-0.5 text-xs">{d}</DialogDescription>}
    </div>
  );

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="flex h-[min(620px,90vh)] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r bg-muted/40 p-2.5 max-sm:w-36">
          <div className="px-2 pt-1 pb-2.5 text-sm font-semibold">Настройки</div>
          {SECTIONS.map((x) => (
            <button key={x.id} type="button" onClick={() => p.onSection(x.id)}
              className={cn('flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] [&_svg]:size-4 [&_svg]:shrink-0',
                p.section === x.id ? 'bg-selected font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
              {x.icon} {x.name}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto p-5 pr-12">
          {p.section === 'look' && (
            <>
              {title('Оформление', 'Тема применяется сразу и запоминается в этом браузере.')}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-3 gap-y-3">
                {THEMES.map((t) => <ThemeCard key={t.id || 'system'} t={t} active={p.theme === t.id} onPick={() => p.onTheme(t.id)} />)}
              </div>
              <div className="mt-6 flex flex-wrap items-start gap-x-10 gap-y-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[0.8125rem] font-medium">Плотность таблицы</span>
                  <ToggleGroup type="single" variant="outline" size="sm" value={p.density} onValueChange={(v) => v && p.onDensity(v as Density)}>
                    <ToggleGroupItem value="normal" className="h-8 px-3 text-xs">Обычная</ToggleGroupItem>
                    <ToggleGroupItem value="compact" className="h-8 px-3 text-xs">Компактная</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="flex min-w-64 flex-1 flex-col gap-1.5">
                  <span className="text-[0.8125rem] font-medium">Размер текста <span className="text-primary tabular-nums">{Math.round(p.scale * 100)}%</span></span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs text-muted-foreground">А</span>
                    <input type="range" min={SCALE_MIN} max={SCALE_MAX} step={0.05} value={p.scale} aria-label="Размер текста"
                      onChange={(e) => p.onScale(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer accent-primary" />
                    <span className="text-base text-muted-foreground">А</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={p.scale === 1} onClick={() => p.onScale(1)}>Как было</Button>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex max-w-md flex-col gap-1.5">
                <span className="text-[0.8125rem] font-medium">Колонки таблицы</span>
                <span className="text-xs text-muted-foreground">Галочка — показывать; стрелки — порядок (сверху вниз — слева направо). То же — кнопкой над таблицей.</span>
                <ColumnsEditor value={p.columns} onChange={p.onColumns} className="rounded-md border p-1" />
              </div>
            </>
          )}
          {p.section === 'connect' && (
            <div className="flex flex-col gap-3">
              {title('Подключение', 'Вход в YouTrack и как искать исполнителя.')}
        <p>YouTrack Reports сначала пробует вашу сессию браузера: если вы вошли в <b>youtrack.office.lan</b>, ничего настраивать не нужно.</p>
        <p>Если YouTrack не пускает — создайте постоянный токен: YouTrack → ваш профиль → <b>Безопасность аккаунта</b> →{' '}
          <b>Новый токен</b> (область — YouTrack), и вставьте его сюда. Токен хранится только в этом браузере.</p>
        <Label className="flex flex-col items-stretch gap-1.5 font-normal">
          <span className="text-xs text-muted-foreground">Токен</span>
          <Input type="password" placeholder="perm:…" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') p.onSaveToken(token); }} />
        </Label>
        {p.status && <p className="text-xs text-muted-foreground">{p.status}</p>}
        <Label className="flex flex-col items-stretch gap-1.5 font-normal">
          <span className="text-xs text-muted-foreground">Как искать исполнителя</span>
          <Select value={p.assigneeAttr} onValueChange={p.onAssigneeAttr}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="assignee">assignee: {'{логин}'} — как в YouTrack</SelectItem>
              <SelectItem value="for">for: {'{логин}'}</SelectItem>
              <SelectItem value="Исполнитель">Исполнитель: {'{логин}'}</SelectItem>
            </SelectContent>
          </Select>
        </Label>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="outline" onClick={p.onProfile}><ExternalLinkIcon /> Открыть профиль</Button>
          <Button variant="outline" onClick={() => { setToken(''); p.onSaveToken(''); }}>Убрать токен</Button>
          <Button onClick={() => p.onSaveToken(token)}>Сохранить и проверить</Button>
        </div>
            </div>
          )}
          {p.section === 'updates' && (
            <div className="flex flex-col gap-3">
              {title('Обновления', 'Новые версии проверяются на GitHub раз в 6 часов.')}
        <p>Установлена <b>{VERSION}</b>. <span className="text-muted-foreground">{updStatus}</span></p>
        {fresh && latest && (
          <>
            <div className="rounded-md border bg-muted/50 px-3 py-2">
              <div className="mb-1 text-xs font-semibold text-primary">Что нового в {latest.version}</div>
              {releaseNotesOnly(latest.notes)
                ? <div className="md max-h-64 overflow-auto text-xs [&_li]:my-0.5" dangerouslySetInnerHTML={{ __html: md(releaseNotesOnly(latest.notes)) }} />
                : <p className="text-xs text-muted-foreground">Описания нет.</p>}
            </div>
            <ol className="list-decimal space-y-0.5 pl-5 text-xs [&_code]:font-mono">
              {PLATFORM === 'firefox' ? <>
                <li>«Скачать» — загрузится файл <code>.xpi</code>.</li>
                <li>Перетащите его в окно Firefox и подтвердите установку — настройки сохранятся.</li>
              </> : <>
                <li>«Скачать» — загрузится архив <code>.zip</code>.</li>
                <li>Распакуйте его <b>в ту же папку</b>, откуда установлено расширение, с заменой файлов.</li>
                <li>«Перезапустить расширение» — YouTrack Reports перечитает файлы и откроется заново. Токен и настройки сохранятся.</li>
              </>}
            </ol>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={p.updBusy} onClick={p.onCheckUpdate}><RefreshCwIcon /> Проверить обновления</Button>
          {fresh && PLATFORM === 'chromium' && inExtension && (
            <Button variant="outline" size="sm" onClick={p.onReload} title="Перечитать файлы расширения с диска"><RotateCwIcon /> Перезапустить расширение</Button>
          )}
          {fresh && latest && <Button size="sm" onClick={p.onDownloadUpdate}><DownloadIcon /> Скачать {latest.version}</Button>}
          <Button variant="ghost" size="sm" onClick={p.onHistory} title="Что менялось в каждой версии"><HistoryIcon /> История изменений</Button>
        </div>

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
