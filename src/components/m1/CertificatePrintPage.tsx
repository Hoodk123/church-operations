import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  venueLabel,
  personName,
  fetchPresentCounts,
  fmtDateFull,
  fmtDate,
} from '@/components/m1/m1';
import { CHURCH_NAME, CERTIFICATE_SIGNATORIES } from '@/lib/church';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface CertState {
  certificate_no: string | null;
  first_name: string;
  last_name: string;
  class_title: string;
  class_venue: string | null;
  required_days: number;
  issued_at: string | null;
  present: number;
}

export default function CertificatePrintPage() {
  const [searchParams] = useSearchParams();
  const enrollmentId = searchParams.get('e');
  const supabase = createClient();

  const [state, setState] = useState<CertState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!enrollmentId) {
      setError('Missing certificate.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('m1_enrollments')
      .select('id, person_id, certificate_no, certificate_issued_at, class_id')
      .eq('id', enrollmentId)
      .single();
    if (error || !data) {
      setError('Could not load this certificate.');
      setLoading(false);
      return;
    }

    const base = data as { id: string; person_id: string; certificate_no: string | null; certificate_issued_at: string | null; class_id: string };
    const [personRes, classRes, counts] = await Promise.all([
      supabase.from('people').select('first_name, last_name').eq('id', base.person_id).single(),
      supabase.from('m1_classes').select('title, venue, required_days').eq('id', base.class_id).single(),
      fetchPresentCounts(supabase, base.class_id),
    ]);

    if (personRes.error || !personRes.data || classRes.error || !classRes.data) {
      setError('Could not load this certificate.');
      setLoading(false);
      return;
    }

    setState({
      certificate_no: base.certificate_no,
      first_name: personRes.data.first_name,
      last_name: personRes.data.last_name,
      class_title: classRes.data.title,
      class_venue: classRes.data.venue,
      required_days: classRes.data.required_days,
      issued_at: base.certificate_issued_at,
      present: counts[base.person_id] ?? 0,
    });
    setLoading(false);
  }, [enrollmentId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-6 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Print certificate
        </Button>
        <p className="text-xs text-muted-foreground">
          Share the signed certificate PDF with the graduate or print it for them.
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-4 print:max-w-none print:px-0">
        <div className="mx-auto w-full rounded-lg border border-slate-300 bg-white p-8 shadow-sm print:rounded-none print:border-none print:shadow-none sm:p-12">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              {CHURCH_NAME}
            </p>
            <h1 className="mt-6 font-serif text-3xl font-semibold text-slate-900">
              Certificate of Completion
            </h1>
            <p className="mt-2 font-serif text-base text-slate-600">Membership Class</p>
          </div>

          <p className="mx-auto mt-10 max-w-sm text-center font-serif text-lg leading-relaxed text-slate-700">
            This certifies that{' '}
            <span className="font-semibold">
              {personName({ first_name: state.first_name, last_name: state.last_name })}
            </span>{' '}
            has completed {state.class_title} at {venueLabel(state.class_venue)}.
          </p>

          <div className="mx-auto mt-8 flex w-fit flex-col items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-8 py-3">
            <span className="text-xs text-slate-500">Days attended</span>
            <span className="font-serif text-2xl">
              {state.present} / {state.required_days}
            </span>
          </div>

          <p className="mt-8 text-center text-xs text-slate-500">
            {state.issued_at ? fmtDateFull(state.issued_at) : fmtDate(new Date().toISOString())}
            {state.certificate_no ? ` · Certificate ${state.certificate_no}` : ''}
          </p>

          <div className="mt-14 grid grid-cols-2 gap-10 px-4">
            {CERTIFICATE_SIGNATORIES.map((sig) => (
              <div key={sig.label} className="text-center">
                <div className="mx-auto w-44 border-t border-slate-400 pt-2">
                  <p className="font-serif text-lg">{sig.name}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{sig.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}