// Окно выгрузки: формат и что включить.
import { useState } from 'react';
import { CopyIcon, DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ExportOptions } from '../../core/export';

export type Format = 'md' | 'json' | 'csv' | 'txt';

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: string;
  format: Format;
  onFormat: (f: Format) => void;
  onCopy: (o: ExportOptions) => void;
  onSave: (o: ExportOptions) => void;
}

const FORMATS: { v: Format; label: string; title?: string }[] = [
  { v: 'md', label: 'Markdown', title: 'Лучше всего подходит для загрузки в модель' },
  { v: 'json', label: 'JSON' },
  { v: 'csv', label: 'CSV (Excel)', title: 'Открывается в Excel' },
  { v: 'txt', label: 'TXT', title: 'Как в скрипте YoutrackReportByUser: «- KEY: название (Описание: …)»' },
];

export function ExportDialog({ open, onOpenChange, count, format, onFormat, onCopy, onSave }: ExportDialogProps) {
  const [o, setO] = useState<Required<ExportOptions>>({ description: true, comments: true, fields: true, prompt: false });
  const opt = (k: keyof ExportOptions, label: string) => (
    <Label className="gap-2 font-normal">
      <Checkbox checked={o[k]} onCheckedChange={(v) => setO((x) => ({ ...x, [k]: !!v }))} /> {label}
    </Label>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Выгрузка задач</DialogTitle>
          <DialogDescription>{count}</DialogDescription>
        </DialogHeader>
        <ToggleGroup type="single" variant="outline" value={format} onValueChange={(v) => v && onFormat(v as Format)} className="justify-start">
          {FORMATS.map((f) => <ToggleGroupItem key={f.v} value={f.v} title={f.title} className="px-3">{f.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="flex flex-col gap-2.5 py-1">
          {opt('description', 'Описание')}
          {opt('comments', 'Комментарии')}
          {opt('fields', 'Все поля задачи (тип, приоритет, время…)')}
          {opt('prompt', 'Инструкция для модели в начале')}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onCopy(o)}><CopyIcon /> Копировать</Button>
          <Button onClick={() => onSave(o)}><DownloadIcon /> Скачать файл</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
