// Загрузка поверх таблицы: прежние результаты затеняются со спиннером, а если их нет — строки-заглушки.
// Появляется с задержкой, чтобы быстрый поиск не мигал.
import { Loader2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

const fadeIn = { animation: 'td-fade-in 0.2s ease-out 0.15s both' };

/** Мерцающие строки вместо пустой таблицы. */
function SkeletonRows() {
  const widths = ['w-3/5', 'w-2/5', 'w-1/2', 'w-4/6', 'w-1/3', 'w-3/6', 'w-2/5', 'w-3/5'];
  return (
    <div className="flex flex-col">
      <div className="flex h-8 items-center gap-4 border-b px-3">
        {[10, 40, 16, 16, 20].map((w, i) => <div key={i} className="h-2.5 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />)}
      </div>
      {widths.map((w, i) => (
        <div key={i} className="flex h-9 items-center gap-4 border-b px-3" style={{ opacity: 1 - i * 0.1 }}>
          <div className="size-4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className={cn('h-3 animate-pulse rounded bg-muted', w)} />
          <div className="ml-auto h-4 w-14 animate-pulse rounded bg-muted" />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function TableLoader({ text, hasResults }: { text: string; hasResults: boolean }) {
  return (
    <div role="status" aria-live="polite" style={fadeIn}
      className={cn('absolute inset-0 z-20 flex flex-col', hasResults ? 'bg-card/70 backdrop-blur-[1.5px]' : 'bg-card')}>
      {!hasResults && <div className="absolute inset-0 overflow-hidden"><SkeletonRows /></div>}
      <div className="relative flex flex-1 items-center justify-center px-4">
        <div className="flex max-w-full items-center gap-2.5 rounded-lg border bg-popover px-4 py-2.5 text-sm shadow-md">
          <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
          <span className="truncate">{hasResults ? 'Обновляю результаты' : 'Ищу задачи'}{text && <span className="text-muted-foreground"> · {text}</span>}</span>
        </div>
      </div>
    </div>
  );
}
