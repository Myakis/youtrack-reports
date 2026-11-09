// История разговоров с ИИ: поиск, просмотр, копирование ответа, удаление.
import { useEffect, useMemo, useState } from 'react';
import { CopyIcon, HistoryIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { copyText } from '../lib/net';
import { deleteChat, filterChats, loadChats, type SavedChat } from '../lib/aiHistory';
import { md } from '../md';

const when = (ms: number) => new Date(ms).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

export function AiHistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [list, setList] = useState<SavedChat[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('');
  const [copied, setCopied] = useState(-1);
  useEffect(() => { if (open) loadChats().then((l) => { setList(l); setSel((s) => s || l[0]?.id || ''); }); }, [open]);
  const shown = useMemo(() => filterChats(list, q), [list, q]);
  const chat = list.find((c) => c.id === sel) ?? null;

  const remove = async (id: string) => {
    const l = await deleteChat(id);
    setList(l);
    if (id === sel) setSel(l[0]?.id ?? '');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(680px,90vh)] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex w-72 shrink-0 flex-col border-r max-sm:w-44">
          <div className="flex flex-col gap-2 border-b p-3">
            <DialogTitle className="flex items-center gap-2 text-sm"><HistoryIcon className="size-4" /> История разговоров</DialogTitle>
            <DialogDescription className="sr-only">Сохранённые разговоры с ИИ</DialogDescription>
            <div className="relative">
              <SearchIcon className="absolute top-2 left-2 size-4 text-muted-foreground" />
              <Input className="h-8 pl-7" placeholder="Найти: сотрудник, цель, слово из ответа…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {shown.map((c) => (
              <button key={c.id} type="button" onClick={() => setSel(c.id)}
                className={cn('flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left', c.id === sel ? 'bg-selected' : 'hover:bg-accent')}>
                <span className={cn('line-clamp-2 text-[0.7812rem]', c.id === sel && 'font-medium text-primary')}>{c.title}</span>
                <span className="text-[0.6875rem] text-muted-foreground">{when(c.updated)} · {c.turns.filter((t) => t.kind === 'a').length} отв.</span>
              </button>
            ))}
            {!shown.length && (
              <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
                {list.length ? 'Ничего не найдено' : 'Пока пусто. Разговоры сохраняются сами после каждого ответа модели.'}
              </p>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {chat ? (
            <>
              <div className="flex items-start gap-3 border-b px-4 py-3 pr-12">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{chat.title}</div>
                  <div className="text-xs text-muted-foreground">{chat.context} · задач: {chat.count} · {when(chat.created)}</div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => remove(chat.id)}>
                  <Trash2Icon /> Удалить
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-4">
                {chat.turns.map((t, i) => t.kind === 'q' ? (
                  <div key={i} className="max-h-40 max-w-[85%] self-end overflow-auto rounded-xl rounded-br-sm bg-primary/15 px-3 py-2 whitespace-pre-wrap">{t.text}</div>
                ) : (
                  <div key={i} className="rounded-lg border px-3 py-2">
                    <div className="md" dangerouslySetInnerHTML={{ __html: md(t.text) }} />
                    <div className="mt-1.5 flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
                      <span className="flex-1">{t.meta}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={async () => { if (await copyText(t.text)) setCopied(i); }}>
                        <CopyIcon /> {copied === i ? 'Скопировано' : 'Копировать ответ'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="m-auto text-sm text-muted-foreground">Выберите разговор слева</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
