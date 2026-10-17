import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, HeartHandshake } from 'lucide-react';
import { createAnonClient } from '@/lib/supabase/anon';
import { ABSENCE_REASONS, type AbsenceReason } from '@/lib/templates';
import { fmtDateFull } from '@/components/m1/m1';
import { CHURCH_NAME } from '@/lib/church';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

interface ReplyContext {
  first_name: string;
  day_number: number;
  session_date: string;
  summary: string | null;
  next_session_date: string | null;
  already_replied: boolean;
}

export default function ReplyPage() {
  const { token } = useParams();
  const supabase = createAnonClient();

  const [ctx, setCtx] = useState<ReplyContext | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState<AbsenceReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.resolve(supabase.rpc('get_reply_context', { p_token: token }))
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as ReplyContext[];
        if (rows.length === 0) {
          setError('This link has finished.');
          return;
        }
        setCtx(rows[0]);
        if (rows[0].already_replied) setDone(true);
      }, () => setError('This link has finished.'));
  }, [token, supabase]);

  async function submit() {
    if (!token || !reason) return;
    setSending(true);
    const { data } = await supabase.rpc('submit_absence_reply', {
      p_token: token,
      p_reason: reason,
      p_note: note.trim(),
    });
    setSending(false);
    if (data) {
      setDone(true);
    } else {
      setError('That reply could not be saved. The link may have expired.');
    }
  }

  if (error) {
    return (
      <Shell>
        <HeartHandshake className="mx-auto size-8 text-muted-foreground" />
        <h1 className="text-center font-heading text-lg font-semibold">This link has finished</h1>
        <p className="text-center text-sm text-muted-foreground">
          If you still want to tell us something, please speak to your class leader.
        </p>
      </Shell>
    );
  }

  if (!ctx) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }

  if (done || ctx.already_replied) {
    return (
      <Shell>
        <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
        <h1 className="text-center font-heading text-lg font-semibold">Thank you, {ctx.first_name}</h1>
        <p className="text-center text-sm text-muted-foreground">
          We got your reply and will be in touch. See you at the next class.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-center font-heading text-lg font-semibold">
        Hi {ctx.first_name}, we missed you
      </h1>
      <p className="text-center text-sm text-muted-foreground">
        M1 Class · Day {ctx.day_number} · {fmtDateFull(ctx.session_date)}
      </p>

      {ctx.summary && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          What we studied: {ctx.summary}
        </p>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Is there something that kept you away? Only if you would like to share.</Label>
          <div className="flex flex-wrap gap-1.5">
            {ABSENCE_REASONS.map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={reason === r ? 'default' : 'outline'}
                onClick={() => setReason(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reply-note">Anything to add?</Label>
          <Textarea
            id="reply-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional message for the team"
          />
        </div>

        <Button className="w-full" disabled={!reason || sending} onClick={submit}>
          {sending ? <Spinner className="size-4" /> : null}
          Send
        </Button>
      </div>

      {ctx.next_session_date && (
        <p className="text-center text-xs text-muted-foreground">
          Next class · {fmtDateFull(ctx.next_session_date)}
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        {CHURCH_NAME}
      </p>
      <div className="w-full max-w-sm space-y-4">{children}</div>
    </div>
  );
}