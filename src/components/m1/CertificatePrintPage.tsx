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
  id: string;
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
  const param = searchParams.get('e') ?? '';
  const supabase = createClient();

  const [state, setState] = useState<CertState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const ids = param.split(',').map((v) => v.trim()).filter(Boolean);
    if (ids.length === 0) {
      setError('Missing certificate.');
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('m1_enrollments')
      .select('id, person_id, certificate_no, certificate_issued_at, class_id')
      .in('id', ids);
    const base = (data ?? []) as {
      id: string;
      person_id: string;
      certificate_no: string | null;
      certificate_issued_at: string | null;
      class_id: string;
    }[];
    if (base.length === 0) {
      setError('Could not load this certificate.');
      setLoading(false);
      return;
    }

    const orders = new Map(ids.map((id, index) => [id, index]));
    const built = await Promise.all(
      base.map(async (row) => {
        const [personRes, classRes, counts] = await Promise.all([
          supabase.from('people').select('first_name, last_name').eq('id', row.person_id).single(),
          supabase.from('m1_classes').select('title, venue, required_days').eq('id', row.class_id).single(),
          fetchPresentCounts(supabase, row.class_id),
        ]);
        if (personRes.error || !personRes.data || classRes.error || !classRes.data) return null;
        return {
          id: row.id,
          certificate_no: row.certificate_no,
          first_name: personRes.data.first_name,
          last_name: personRes.data.last_name,
          class_title: classRes.data.title,
          class_venue: classRes.data.venue,
          required_days: classRes.data.required_days,
          issued_at: row.certificate_issued_at,
          present: counts[row.person_id] ?? 0,
        } satisfies CertState;
      })
    );

    const clean = built.filter((row): row is CertState => !!row);
    clean.sort((a, b) => (orders.get(a.id) ?? 0) - (orders.get(b.id) ?? 0));
    if (clean.length === 0) {
      setError('Could not load this certificate.');
    } else {
      setState(clean);
    }
    setLoading(false);
  }, [param, supabase]);

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

  if (error || state.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        .cert-page { break-after: page; }
        .cert-page:last-child { break-after: auto; }
      `}</style>
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-6 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          Print {state.length > 1 ? `${state.length} certificates` : 'certificate'}
        </Button>
        <p className="text-xs text-muted-foreground">
          One certificate per page. Share the PDF with the graduates or print it for them.
        </p>
      </div>

      <div className="mx-auto max-w-5xl px-4 print:max-w-none print:px-0">
        {state.map((cert) => (
          <div
            key={cert.id}
            className="cert-page mx-auto mb-6 w-full rounded-lg border border-slate-300 bg-white p-8 shadow-sm print:mb-0 print:rounded-none print:border-none print:shadow-none sm:p-12"
          >
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                {CHURCH_NAME}
              </p>
              <h1 className="mt-6 font-serif text-3xl font-semibold text-slate-900">
                Certificate of Completion
              </h1>
              <p className="mt-2 font-serif text-base text-slate-600">Membership Class</p>
            </div>

            <p className="mx-auto mt-10 max-w-xl text-center font-serif text-lg leading-relaxed text-slate-700">
              This certifies that{' '}
              <span className="font-semibold">
                {personName({ first_name: cert.first_name, last_name: cert.last_name })}
              </span>{' '}
              attended {cert.required_days} days of the M1 Class, {cert.class_title}, held at{' '}
              {venueLabel(cert.class_venue)}.
            </p>

            <div className="mx-auto mt-8 flex w-fit flex-col items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-8 py-3">
              <span className="text-xs text-slate-500">Days attended</span>
              <span className="font-serif text-2xl">
                {cert.present} / {cert.required_days}
              </span>
            </div>

            <p className="mt-8 text-center text-xs text-slate-500">
              {cert.issued_at ? fmtDateFull(cert.issued_at) : fmtDate(new Date().toISOString())}
              {cert.certificate_no ? ` · Certificate ${cert.certificate_no}` : ''}
            </p>

            <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-10 px-4">
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
        ))}
      </div>
    </div>
  );
}
