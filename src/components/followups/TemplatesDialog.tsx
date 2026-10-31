import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  reorderTemplates,
  updateTemplate,
  type TemplateApi,
} from '@/lib/api/templates';
import { categorySchema } from '../../../packages/shared/schemas/people';
import { categories } from '@/components/people/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type Template = TemplateApi;

const NONE = 'none';

interface TemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export default function TemplatesDialog({
  open,
  onOpenChange,
  onChanged,
}: TemplatesDialogProps) {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listTemplates());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load templates.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    async function run() {
      await load();
    }
    void run();
  }, [open, load]);

  function patch(id: string, changes: Partial<Template>) {
    setRows((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, ...changes } : r)) : prev
    );
  }

  async function save(row: Template) {
    if (!row.name.trim() || !row.body.trim()) {
      toast.error('Name and message are required.');
      return;
    }
    setBusyId(row.id);
    try {
      await updateTemplate(row.id, {
        name: row.name.trim(),
        body: row.body.trim(),
        suggestedCategory: row.suggestedCategory,
        sortOrder: row.sortOrder,
        active: row.active,
      });
      toast.success('Template saved');
      onChanged();
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save template.');
    } finally {
      setBusyId(null);
    }
  }

  async function addRow() {
    const maxOrder = rows?.reduce((m, r) => Math.max(m, r.sortOrder), 0) ?? 0;
    setBusyId('new');
    try {
      await createTemplate({
        name: `New template ${(rows?.length ?? 0) + 1}`,
        body: 'Hello {name}, ',
        suggestedCategory: null,
        sortOrder: maxOrder + 1,
        active: true,
      });
      onChanged();
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add template.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: Template) {
    if (!window.confirm(`Delete template “${row.name}”?`)) return;
    setBusyId(row.id);
    try {
      await deleteTemplate(row.id);
      toast.success('Template deleted');
      onChanged();
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete template.');
    } finally {
      setBusyId(null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rows) return;
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index];
    const b = rows[target];
    const orderA = a.sortOrder;
    // Swap on screen immediately.
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...a, sortOrder: b.sortOrder };
      next[target] = { ...b, sortOrder: orderA };
      return next.sort((x, y) => x.sortOrder - y.sortOrder);
    });
    try {
      await reorderTemplates([
        { id: a.id, sortOrder: b.sortOrder },
        { id: b.id, sortOrder: orderA },
      ]);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reorder templates.');
      void load();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Message templates</DialogTitle>
          <DialogDescription>
            Use {'{name}'} and {'{volunteer}'} as placeholders.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60dvh] space-y-3 overflow-y-auto pr-1">
          {rows === null ? (
            <>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : (
            rows.map((row, index) => (
              <div key={row.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={row.name}
                    onChange={(e) => patch(row.id, { name: e.target.value })}
                    className="text-base"
                    aria-label="Template name"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Move down"
                    disabled={index === rows.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete template"
                    disabled={busyId === row.id}
                    onClick={() => void remove(row)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="space-y-1">
                    <Label className="text-xs">Suggested category</Label>
                    <Select
                      value={row.suggestedCategory ?? NONE}
                      onValueChange={(v) =>
                        patch(row.id, {
                          suggestedCategory: v === NONE ? null : categorySchema.parse(v),
                        })
                      }
                    >
                      <SelectTrigger className="w-full text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Any category</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 sm:pt-5">
                    <Switch
                      checked={row.active}
                      onCheckedChange={(checked) => patch(row.id, { active: checked })}
                      aria-label="Active"
                    />
                    <span className="text-sm">Active</span>
                  </label>
                </div>

                <Textarea
                  value={row.body}
                  onChange={(e) => patch(row.id, { body: e.target.value })}
                  className="min-h-[80px] text-base"
                  aria-label="Template message"
                />

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === row.id}
                    onClick={() => void save(row)}
                  >
                    {busyId === row.id && <Spinner className="size-3.5" />}
                    Save
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => void addRow()}
          disabled={busyId === 'new'}
        >
          {busyId === 'new' ? <Spinner className="size-4" /> : <Plus className="size-4" />}
          Add template
        </Button>
      </DialogContent>
    </Dialog>
  );
}
