import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
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

export interface Template {
  id: string;
  name: string;
  body: string;
  suggested_category: string | null;
  sort_order: number;
  active: boolean;
}

const NONE = 'none';

interface TemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  onChanged: () => void;
}

export default function TemplatesDialog({
  open,
  onOpenChange,
  memberId,
  onChanged,
}: TemplatesDialogProps) {
  const supabase = createClient();
  const [rows, setRows] = useState<Template[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('message_templates')
      .select('id, name, body, suggested_category, sort_order, active')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      toast.error(rlsErrorMessage(error));
      setRows([]);
      return;
    }
    setRows((data ?? []) as Template[]);
  }, [supabase]);

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
    const payload = {
      name: row.name.trim(),
      body: row.body.trim(),
      suggested_category: row.suggested_category,
      sort_order: row.sort_order,
      active: row.active,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('message_templates')
      .update(payload)
      .eq('id', row.id);
    setBusyId(null);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success('Template saved');
    onChanged();
    void load();
  }

  async function addRow() {
    const maxOrder = rows?.reduce((m, r) => Math.max(m, r.sort_order), 0) ?? 0;
    setBusyId('new');
    const { error } = await supabase.from('message_templates').insert({
      name: `New template ${(rows?.length ?? 0) + 1}`,
      body: 'Hello {name}, ',
      suggested_category: null,
      sort_order: maxOrder + 1,
      active: true,
      created_by: memberId,
    });
    setBusyId(null);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    onChanged();
    void load();
  }

  async function remove(row: Template) {
    if (!window.confirm(`Delete template “${row.name}”?`)) return;
    setBusyId(row.id);
    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', row.id);
    setBusyId(null);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success('Template deleted');
    onChanged();
    void load();
  }

  async function move(index: number, dir: -1 | 1) {
    if (!rows) return;
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index];
    const b = rows[target];
    const orderA = a.sort_order;
    // Swap on screen immediately.
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...a, sort_order: b.sort_order };
      next[target] = { ...b, sort_order: orderA };
      return next.sort((x, y) => x.sort_order - y.sort_order);
    });
    const { error } = await supabase
      .from('message_templates')
      .upsert([
        { id: a.id, sort_order: b.sort_order },
        { id: b.id, sort_order: orderA },
      ]);
    if (error) {
      toast.error(rlsErrorMessage(error));
      void load();
      return;
    }
    onChanged();
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
                      value={row.suggested_category ?? NONE}
                      onValueChange={(v) =>
                        patch(row.id, {
                          suggested_category: v === NONE ? null : v,
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
