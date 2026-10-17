import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, MessageCircle, Pencil, Send, ChevronDown } from 'lucide-react';
import { parsePhoneNumber } from 'libphonenumber-js';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { phoneDigits } from '@/lib/phone';
import { useIsMobile } from '@/lib/use-is-mobile';
import { type SelectOption } from '@/lib/select-items';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TemplatesDialog, { type Template } from './TemplatesDialog';
import { fullName, type FollowUpPerson } from './utils';

interface MessagePanelProps {
  person: FollowUpPerson | null;
  seedCategory: string | null;
  volunteerName: string;
  memberId: string;
  isAdmin: boolean;
}

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  try {
    const parsed = parsePhoneNumber(phone, 'RW');
    if (parsed) return parsed.number.replace(/^\+/, '');
  } catch {
    /* fall through */
  }
  const digits = phoneDigits(phone);
  return digits || null;
}

export default function MessagePanel({
  person,
  seedCategory,
  volunteerName,
  memberId,
  isAdmin,
}: MessagePanelProps) {
  const supabase = createClient();
  const isMobile = useIsMobile();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [manualId, setManualId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openOnMobile, setOpenOnMobile] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('message_templates')
      .select('id, name, body, suggested_category, sort_order, active')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      toast.error(rlsErrorMessage(error));
      setTemplates([]);
      return;
    }
    setTemplates((data ?? []) as Template[]);
  }, [supabase]);

  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, [load]);

  // Default template: matching the seed category, else the first.
  const selectedId = useMemo(() => {
    if (!templates || templates.length === 0) return '';
    if (manualId && templates.some((t) => t.id === manualId)) return manualId;
    const match = templates.find((t) => t.suggested_category === seedCategory);
    return (match ?? templates[0]).id;
  }, [templates, manualId, seedCategory]);

  const selected = useMemo(
    () => templates?.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  const templateItems = useMemo<SelectOption[]>(
    () => (templates ?? []).map((t) => ({ value: t.id, label: t.name })),
    [templates]
  );

  const message = useMemo(() => {
    if (!selected) return '';
    const firstName = person?.first_name ?? 'there';
    return selected.body
      .replaceAll('{name}', firstName)
      .replaceAll('{volunteer}', volunteerName);
  }, [selected, person, volunteerName]);

  const waText = person?.phone ? waNumber(person.phone) : null;
  const waLink =
    waText && message
      ? `https://wa.me/${waText}?text=${encodeURIComponent(message)}`
      : null;

  async function copy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success('Message copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy the message');
    }
  }

  const body = (
    <div className="flex flex-col gap-3">
      <Select
        items={templateItems}
        value={selectedId}
        onValueChange={(v) => {
          if (v) {
            setManualId(v);
          }
        }}
      >
        <SelectTrigger className="w-full text-base">
          <SelectValue placeholder="Choose a template" />
        </SelectTrigger>
        <SelectContent>
          {templateItems.map((t) => (
            <SelectItem key={t.value} value={t.value} className="text-base">
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
        {message || 'No template available.'}
      </div>

      {person && (
        <p className="text-xs text-muted-foreground">
          For <span className="font-medium text-foreground">{fullName(person)}</span>
        </p>
      )}

      <div className="flex gap-2">
        {waLink ? (
          <a href={waLink} target="_blank" rel="noreferrer" className="flex-1">
            <Button className="w-full" disabled={!message}>
              <MessageCircle className="size-4" />
              WhatsApp
            </Button>
          </a>
        ) : (
          <Button className="flex-1" disabled>
            <Send className="size-4" />
            WhatsApp
          </Button>
        )}
        <Button variant="outline" onClick={() => void copy()} disabled={!message}>
          <Copy className="size-4" />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setDialogOpen(true)}
        >
          <Pencil className="size-3.5" />
          Edit templates
        </Button>
      )}
    </div>
  );

  const panel = (
    <Card className="md:sticky md:top-16">
      <CardHeader
        className={isMobile ? 'cursor-pointer select-none' : undefined}
        onClick={isMobile ? () => setOpenOnMobile((v) => !v) : undefined}
      >
        <CardTitle className="flex items-center justify-between">
          Message to send
          {isMobile && (
            <ChevronDown
              className={`size-4 text-muted-foreground transition-transform ${
                openOnMobile ? 'rotate-180' : ''
              }`}
            />
          )}
        </CardTitle>
      </CardHeader>
      {(!isMobile || openOnMobile) && (
        <CardContent>
          {templates === null ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            body
          )}
        </CardContent>
      )}
    </Card>
  );

  return (
    <>
      {panel}
      {isAdmin && (
        <TemplatesDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          memberId={memberId}
          onChanged={() => {
            setManualId(null);
            void load();
          }}
        />
      )}
    </>
  );
}
