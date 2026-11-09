// «Что нового»: изменения версии (или нескольких, если обновлялись через одну) из встроенного CHANGELOG.md.
import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { entriesMarkdown, type ChangelogEntry } from '../../core/changelog';
import { md } from '../md';

export interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: ChangelogEntry[];
  /** Заголовок: «Обновлено до 0.10.0» или «История изменений». */
  title: string;
  description?: string;
}

export function WhatsNewDialog({ open, onOpenChange, entries, title, description }: WhatsNewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SparklesIcon className="size-4 text-primary" /> {title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="md -mx-1 min-h-0 flex-1 overflow-auto px-1 text-[0.8125rem] [&_h3]:mt-4 [&_h3]:text-primary [&_h3:first-child]:mt-0 [&_li]:my-1"
          dangerouslySetInnerHTML={{ __html: entries.length ? md(entriesMarkdown(entries)) : '<p>Описания изменений нет.</p>' }} />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Понятно</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
