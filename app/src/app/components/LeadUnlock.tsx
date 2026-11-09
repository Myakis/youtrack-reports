// Код «lead»: на весь экран — открыт режим руководителя и обоснование повышения.
import { useEffect } from 'react';
import { CrownIcon, SparklesIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const LEAD_CODE = ['KeyL', 'KeyE', 'KeyA', 'KeyD'];

export function LeadUnlock({ open, onClose, onTry }: { open: boolean; onClose: () => void; onTry: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="lead-title" onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-6 backdrop-blur-md duration-300 animate-in fade-in motion-reduce:animate-none">
      <div onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-xl flex-col items-center gap-5 rounded-2xl border bg-card px-10 py-12 text-center shadow-2xl duration-500 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 motion-reduce:animate-none">
        <button type="button" onClick={onClose} aria-label="Закрыть" className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <XIcon className="size-4" />
        </button>
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-primary/25 blur-xl motion-safe:animate-pulse" />
          <span className="relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <CrownIcon className="size-10" />
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">Режим руководителя</div>
          <h2 id="lead-title" className="text-2xl font-bold">Цели руководителя открыты</h2>
          <div className="flex flex-col gap-2 text-left text-[0.875rem] leading-relaxed text-muted-foreground">
            <p>В окне ИИ появилась группа <b className="text-foreground">«Руководитель»</b>:</p>
            <p><b className="text-foreground">Обоснование повышения</b> — по задачам сотрудника модель напишет текст для колонки
              «Письменное обоснование пересмотра», с текущим и целевым грейдом и вашим описанием сотрудника.</p>
            <p><b className="text-foreground">Встреча 1:1</b> — подготовка к разговору: что сделано, за что похвалить, где были
              сложности и какие вопросы задать.</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={onTry}><SparklesIcon /> Попробовать</Button>
          <Button size="lg" variant="outline" onClick={onClose}>Закрыть</Button>
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">Запомнится в этом браузере.</p>
      </div>
    </div>
  );
}
