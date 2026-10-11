import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Link2, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import {
  fmtDate,
  venueLabel,
  fetchClassSessions,
  type M1Class,
  type M1Person,
  type M1Session,
} from '@/components/m1/m1';
import { fillTemplate } from '@/lib/templates';
import { fetchTemplate } from '@/components/classes/templates';
import { pickChannel, messageHref, type Channel } from '@/lib/messaging';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type SelectOption } from '@/lib/select-items';

export const MATERIALS_BUCKET = 'm1-materials';
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

interface ShareRow {
  person: M1Person;
  channel: Channel;
  href: string;
  opened: boolean;
}

interface MaterialsTabProps {
  klass: M1Class;
  onChanged: () => void;
}

function sizeLabel(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowed(file: File): boolean {
  return ALLOWED.includes(file.type) || file.type.startsWith('image/');
}

interface MaterialMeta {
  id: string;
  session_id: string | null;
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploader: string | null;
}

export function MaterialsTab({ klass, onChanged }: MaterialsTabProps) {
  const member = useShellMember();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const classId = klass.id;

  const isAdmin = member?.role === 'Admin';
  const isLeader =
    member?.role === 'Admin' || member?.role === 'Pastor' || member?.role === 'Follow-up Coordinator';

  const [rows, setRows] = useState<MaterialMeta[]>([]);
  const [sessions, setSessions] = useState<M1Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from('m1_materials')
        .select('id, session_id, title, storage_path, mime_type, size_bytes, created_at, team_members(full_name)')
        .eq('class_id', classId)
        .order('created_at', { ascending: false }),
      fetchClassSessions(supabase, classId),
    ])
      .then(([materials, s]) => {
        const list = (materials.data ?? []) as unknown as {
          id: string;
          session_id: string | null;
          title: string;
          storage_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
          team_members: { full_name: string | null } | { full_name: string | null }[] | null;
        }[];
        setRows(
          list.map((row) => {
            const team = Array.isArray(row.team_members) ? row.team_members[0] : row.team_members;
            return {
              id: row.id,
              session_id: row.session_id,
              title: row.title,
              storage_path: row.storage_path,
              mime_type: row.mime_type,
              size_bytes: row.size_bytes,
              created_at: row.created_at,
              uploader: team?.full_name ?? null,
            };
          })
        );
        setSessions(s);
      })
      .catch((err) => toast.error(rlsErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [supabase, classId]);

  useEffect(() => {
    load();
  }, [load]);

  const dayOf = useCallback(
    (sessionId: string | null) => sessions.find((s) => s.id === sessionId)?.day_number ?? null,
    [sessions]
  );

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      if (!isAllowed(file)) {
        toast.error(`${file.name} is not a PDF, Word, PowerPoint or image file.`);
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 25 MB.`);
        return;
      }
    }
    setUploading(true);
    let uploaded = 0;
    for (const file of list) {
      const path = `${classId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error: uploadErr } = await supabase.storage
        .from(MATERIALS_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (uploadErr) {
        toast.error(rlsErrorMessage(uploadErr));
        continue;
      }
      const { error: insertErr } = await supabase.from('m1_materials').insert({
        class_id: classId,
        title: file.name,
        storage_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: member?.id ?? null,
      });
      if (insertErr) {
        toast.error(rlsErrorMessage(insertErr));
        await supabase.storage.from(MATERIALS_BUCKET).remove([path]);
      } else {
        uploaded += 1;
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      toast.success(`Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'}`);
      load();
      onChanged();
    }
  }

  async function signedUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(MATERIALS_BUCKET).createSignedUrl(path, 7 * 86_400);
    if (error || !data?.signedUrl) {
      toast.error(rlsErrorMessage(error));
      return null;
    }
    return data.signedUrl;
  }

  async function download(row: MaterialMeta) {
    const url = await signedUrl(row.storage_path);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function copyLink(row: MaterialMeta) {
    const url = await signedUrl(row.storage_path);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.info(url);
    }
  }

  async function remove(row: MaterialMeta) {
    setDeleting(row.id);
    const { error: storageErr } = await supabase.storage.from(MATERIALS_BUCKET).remove([row.storage_path]);
    if (storageErr) {
      setDeleting(null);
      toast.error(rlsErrorMessage(storageErr));
      return;
    }
    const { error } = await supabase.from('m1_materials').delete().eq('id', row.id);
    setDeleting(null);
    if (error) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    toast.success('File removed');
    load();
    onChanged();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-3">
        {isLeader && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed p-4 text-center text-sm transition-colors ${
              dragging ? 'border-primary bg-muted/50' : 'border-border'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {uploading ? <Spinner className="size-5" /> : <Upload className="size-5 text-muted-foreground" />}
            <span className="font-medium">
              {uploading ? 'Uploading…' : 'Drop files here or choose files'}
            </span>
            <span className="text-xs text-muted-foreground">
              PDF, Word, PowerPoint, images · up to 25 MB each
            </span>
          </div>
        )}

        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No materials yet</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <EmptyDescription>Uploaded files stay available to the team and can be shared.</EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm">
                <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.title}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {dayOf(row.session_id) && <Badge variant="outline">Day {dayOf(row.session_id)}</Badge>}
                    {sizeLabel(row.size_bytes)}
                    {row.uploader && ` · ${row.uploader}`}
                    {` · ${fmtDate(row.created_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" aria-label="Copy link" onClick={() => copyLink(row)}>
                    <Link2 className="size-4" />
                  </Button>
                  <Button size="icon" variant="outline" aria-label="Download" onClick={() => download(row)}>
                    <Download className="size-4" />
                  </Button>
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Delete file"
                      disabled={deleting === row.id}
                      onClick={() => remove(row)}
                    >
                      {deleting === row.id ? <Spinner className="size-4" /> : <Trash2 className="size-4" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ShareFilesCard klass={klass} rows={rows} sessions={sessions} onSigned={signedUrl} />
    </div>
  );
}

interface ShareFilesCardProps {
  klass: M1Class;
  rows: MaterialMeta[];
  sessions: M1Session[];
  onSigned: (path: string) => Promise<string | null>;
}

function ShareFilesCard({ klass, rows, sessions, onSigned }: ShareFilesCardProps) {
  const member = useShellMember();
  const supabase = createClient();
  const classId = klass.id;

  const [audience, setAudience] = useState('everyone');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [building, setBuilding] = useState(false);
  const [queue, setQueue] = useState<ShareRow[]>([]);
  const [template, setTemplate] = useState('');

  useEffect(() => {
    fetchTemplate(supabase, 'm1_materials').then((t) => setTemplate(t?.body ?? ''));
  }, [supabase]);

  const closedSessions = useMemo(() => sessions.filter((s) => s.closed), [sessions]);

  const audienceItems: SelectOption[] = [
    { value: 'everyone', label: 'Everyone in the class' },
    ...closedSessions.map((s) => ({ value: `missed:${s.id}`, label: `Those who missed Day ${s.day_number}` })),
  ];

  function toggleFile(id: string, checked: boolean) {
    setQueue([]);
    setChosen((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function recipients(): Promise<M1Person[]> {
    if (audience === 'everyone') {
      const { data } = await supabase
        .from('m1_enrollments')
        .select(
          'people(id, first_name, last_name, phone, email, location, address_details, gender, age_group, contact_preference, category, m1_status, baptism_status, needs_m1, needs_baptism, needs_pastor)'
        )
        .eq('class_id', classId)
        .eq('status', 'Enrolled');
      return ((data ?? []) as unknown as { people: M1Person | M1Person[] }[]).map((row) =>
        Array.isArray(row.people) ? row.people[0] : row.people
      ).filter((p): p is M1Person => !!p);
    }
    const sessionId = audience.split(':')[1];
    const { data } = await supabase
      .from('m1_attendance')
      .select(
        'status, people(id, first_name, last_name, phone, email, location, address_details, gender, age_group, contact_preference, category, m1_status, baptism_status, needs_m1, needs_baptism, needs_pastor)'
      )
      .eq('session_id', sessionId)
      .in('status', ['Absent', 'Excused']);
    return ((data ?? []) as unknown as { people: M1Person | M1Person[] }[]).map((row) =>
      Array.isArray(row.people) ? row.people[0] : row.people
    ).filter((p): p is M1Person => !!p);
  }

  async function buildQueue() {
    const files = rows.filter((r) => chosen.has(r.id));
    if (files.length === 0) {
      toast.error('Choose at least one file.');
      return;
    }
    setBuilding(true);
    const links: string[] = [];
    for (const file of files) {
      const url = await onSigned(file.storage_path);
      if (url) links.push(url);
    }
    if (links.length === 0) {
      setBuilding(false);
      toast.error('Could not build file links.');
      return;
    }
    const people = await recipients();
    const built: ShareRow[] = [];
    for (const person of people) {
      const channel = pickChannel({
        phone: person.phone,
        email: person.email,
        contact_preference: person.contact_preference,
      });
      if (!channel) continue;
      const body = fillTemplate(template, {
        name: person.first_name,
        class: klass.title,
        materials_links: links.join('\n'),
        venue: venueLabel(klass.venue),
        volunteer: member?.full_name ?? '',
      });
      const href = messageHref(
        channel,
        { phone: person.phone, email: person.email },
        { subject: `${klass.title} materials`, body: body || links.join('\n') }
      );
      if (!href) continue;
      built.push({ person, channel, href, opened: false });
    }
    setBuilding(false);
    setQueue(built);
    if (built.length === 0) toast.info('Nobody in this group has a phone or email on file.');
  }

  async function open(row: ShareRow) {
    window.open(row.href, '_blank', 'noopener');
    setQueue((prev) => prev.map((r) => (r.person.id === row.person.id ? { ...r, opened: true } : r)));
    await supabase.from('m1_message_log').insert({
      class_id: classId,
      person_id: row.person.id,
      purpose: 'materials',
      channel: row.channel,
      sent_by: member?.id ?? null,
    });
  }

  const whatsappCount = queue.filter((r) => r.channel === 'WhatsApp').length;
  const emailCount = queue.filter((r) => r.channel === 'Email').length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <p className="font-medium">Share files</p>
        <Select
          items={audienceItems}
          value={audience}
          onValueChange={(v) => {
            setQueue([]);
            setAudience(v ?? 'everyone');
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {audienceItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Upload a file first, then choose it here.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <label key={row.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={chosen.has(row.id)} onCheckedChange={(v) => toggleFile(row.id, v === true)} />
                <span className="truncate">{row.title}</span>
              </label>
            ))}
          </div>
        )}

        {queue.length > 0 && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between border-t py-1.5 text-sm">
              <span>By WhatsApp</span>
              <span className="font-medium tabular-nums">{whatsappCount}</span>
            </div>
            <div className="flex items-center justify-between border-t py-1.5 text-sm">
              <span>By email</span>
              <span className="font-medium tabular-nums">{emailCount}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {queue.map((row) => (
                <div key={row.person.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {row.person.first_name} {row.person.last_name}
                  </span>
                  {row.opened ? (
                    <Badge className="border-green-500/40 bg-green-500/10 text-green-700">Opened</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => open(row)}>
                      {row.channel}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Button onClick={buildQueue} disabled={building || chosen.size === 0}>
          {building ? <Spinner className="size-4" /> : null}
          Open share list
        </Button>
        <p className="text-xs text-muted-foreground">
          People get a private link to the files, valid for 7 days. A web page cannot attach files to a
          WhatsApp chat, so the message carries the link.
        </p>
      </CardContent>
    </Card>
  );
}
