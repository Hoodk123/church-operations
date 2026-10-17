import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ExternalLink, MessageCircle, Mail, Smartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useIsMobile } from '@/lib/use-is-mobile';
import { useShellMember } from '@/components/layout/shell';
import {
  availableChannels,
  messageHref,
  type Channel,
  type ContactTarget,
} from '@/lib/messaging';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export type MessagePurpose =
  | 'reminder'
  | 'catch_up'
  | 'materials'
  | 'certificate'
  | 'baptism'
  | 'other';

export interface ComposeRecipient extends ContactTarget {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
}

interface ComposeMessageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: ComposeRecipient;
  heading: string;
  body: string;
  /** Email subject. Left blank for WhatsApp/SMS. */
  subject?: string;
  purpose: MessagePurpose;
  classId?: string | null;
  sessionId?: string | null;
  /** Called after the message is logged so parent lists can show "Sent". */
  onLogged?: () => void;
}

type SendChannel = Exclude<Channel, 'Call'>;

const CHANNEL_META: { channel: SendChannel; label: string; icon: typeof MessageCircle }[] = [
  { channel: 'WhatsApp', label: 'WhatsApp', icon: MessageCircle },
  { channel: 'Email', label: 'Email', icon: Mail },
  { channel: 'SMS', label: 'SMS', icon: Smartphone },
];

/**
 * One recipient, one message: pick a channel, tweak the text, then "Open and
 * send" on the user's own WhatsApp / mail / SMS app — the app never sends
 * messages itself. The send is logged to m1_message_log so the UI can show it
 * was sent.
 */
export default function ComposeMessageSheet({
  open,
  onOpenChange,
  person,
  heading,
  body: initialBody,
  subject: initialSubject = '',
  purpose,
  classId = null,
  sessionId = null,
  onLogged,
}: ComposeMessageSheetProps) {
  const isMobile = useIsMobile();
  const member = useShellMember();
  const supabase = createClient();

  const recipientName =
    (person.name ?? [person.first_name, person.last_name].filter(Boolean).join(' ')) || '—';

  const usable = availableChannels(person).filter((c) => c !== 'Call');
  const defaultChannel = usable.includes('WhatsApp')
    ? 'WhatsApp'
    : usable.includes('Email')
      ? 'Email'
      : usable[0] ?? 'WhatsApp';

  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [body, setBody] = useState(initialBody);
  const [subject, setSubject] = useState(initialSubject);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBody(initialBody);
    setSubject(initialSubject);
    setChannel(
      usable.includes('WhatsApp')
        ? 'WhatsApp'
        : usable.includes('Email')
          ? 'Email'
          : usable[0] ?? 'WhatsApp'
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBody]);

  const showSubject = channel === 'Email';
  const href = messageHref(channel, person, { subject, body });

  async function handleSend() {
    if (!href) {
      toast.error('No {channel} contact on file'.replace('{channel}', channel));
      return;
    }
    window.open(href, '_blank', 'noopener');
    setSending(true);

    const { error } = await supabase.from('m1_message_log').insert({
      person_id: person.id,
      class_id: classId,
      session_id: sessionId,
      purpose,
      channel,
      sent_by: member?.id ?? null,
    });
    setSending(false);

    if (error) {
      // Logging is best-effort; the draft still opened on their phone.
      toast.info(`${recipientName}: message opened in ${channel}`);
      return;
    }
    toast.success(`${recipientName}: opened in ${channel}`);
    onLogged?.();
  }

  const form = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Send by</Label>
        <ToggleGroup
          variant="outline"
          value={[channel]}
          onValueChange={(v) => {
            if (v[0]) setChannel(v[0] as Channel);
          }}
          className="w-full"
        >
          {CHANNEL_META.filter((meta) => usable.includes(meta.channel)).map(
            (meta) => (
              <ToggleGroupItem
                key={meta.channel}
                value={meta.channel}
                className="flex-1"
              >
                <meta.icon className="size-4" />
                {meta.label}
              </ToggleGroupItem>
            )
          )}
        </ToggleGroup>
      </div>

      {showSubject && (
        <div className="space-y-1.5">
          <Label htmlFor="compose-subject">Subject</Label>
          <Input
            id="compose-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-base"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="compose-body">Message</Label>
        <Textarea
          id="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          className="text-base"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        This opens your {channel} app with the message filled in — nothing is
        sent until you press send there. The action is recorded here.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 text-base"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1 text-base"
          disabled={sending || !href}
          onClick={handleSend}
        >
          {sending ? <Spinner className="size-4" /> : <ExternalLink className="size-4" />}
          Open and send
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>{heading}</DrawerTitle>
            <DrawerDescription>{recipientName}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{form}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{heading}</SheetTitle>
          <SheetDescription>{recipientName}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{form}</div>
      </SheetContent>
    </Sheet>
  );
}