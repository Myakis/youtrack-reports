// Настройки: версия и обновления с GitHub, вход в YouTrack (токен), как искать исполнителя.
import { useEffect, useState } from 'react';
import { DownloadIcon, ExternalLinkIcon, RefreshCwIcon, RotateCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { inExtension, PLATFORM, VERSION } from '../../shared';
import { isNewer, type UpdateState } from '../../core/update';
import { md } from '../md';

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

  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Версия</DialogTitle></DialogHeader>
        <p>Установлена <b>{VERSION}</b>. <span className="text-muted-foreground">{updStatus}</span></p>
        {fresh && latest && (
          <>
            <Collapsible>
              <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground">Что нового в {latest.version} ▾</CollapsibleTrigger>
              <CollapsibleContent>
                {latest.notes.trim()
                  ? <div className="md mt-1 max-h-44 overflow-auto rounded-md bg-muted px-3 py-2 text-xs" dangerouslySetInnerHTML={{ __html: md(latest.notes) }} />
                  : <p className="text-muted-foreground">Описания нет.</p>}
              </CollapsibleContent>
            </Collapsible>
            <ol className="list-decimal space-y-0.5 pl-5 text-xs [&_code]:font-mono">
              {PLATFORM === 'firefox' ? <>
                <li>«Скачать» — загрузится файл <code>.xpi</code>.</li>
                <li>Перетащите его в окно Firefox и подтвердите установку — настройки сохранятся.</li>
              </> : <>
                <li>«Скачать» — загрузится архив <code>.zip</code>.</li>
                <li>Распакуйте его <b>в ту же папку</b>, откуда установлено расширение, с заменой файлов.</li>
                <li>«Перезапустить расширение» — TrackDesk перечитает файлы и откроется заново. Токен и настройки сохранятся.</li>
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
        </div>

        <Separator className="my-1" />

        <DialogHeader><DialogTitle>Вход в YouTrack</DialogTitle></DialogHeader>
        <p>TrackDesk сначала пробует вашу сессию браузера: если вы вошли в <b>youtrack.office.lan</b>, ничего настраивать не нужно.</p>
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
      </DialogContent>
    </Dialog>
  );
}
