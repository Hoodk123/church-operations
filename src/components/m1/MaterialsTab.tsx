import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Link2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import { fmtDate, type M1Class } from '@/components/m1/m1';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle, ItemMedia } from '@/components/ui/item';

export const MATERIALS_BUCKET = 'm1-materials';

interface MaterialRow {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
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

export function MaterialsTab({ klass, onChanged }: MaterialsTabProps) {
  const member = useShellMember();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const isLeader =
    member?.role === 'Admin' || member?.role === 'Pastor' || member?.role === 'Follow-up Coordinator';

  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.resolve(
      supabase
        .from('m1_materials')
        .select('id, title, storage_path, mime_type, size_bytes, created_at')
        .eq('class_id', klass.id)
        .order('created_at', { ascending: false })
    )
      .then(({ data }) => setRows((data ?? []) as MaterialRow[]))
      .finally(() => setLoading(false));
  }, [supabase, klass.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFile(file: File) {
    const path = `${klass.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    setUploading(true);
    const { error: uploadErr } = await supabase.storage
      .from(MATERIALS_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) {
      toast.error(rlsErrorMessage(uploadErr));
      setUploading(false);
      return;
    }
    const { error: insertErr } = await supabase.from('m1_materials').insert({
      class_id: klass.id,
      title: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: member?.id ?? null,
    });
    setUploading(false);
    if (insertErr) {
      toast.error(rlsErrorMessage(insertErr));
      return;
    }
    toast.success('Material uploaded');
    load();
    onChanged();
  }

  async function download(row: MaterialRow) {
    const { data, error } = await supabase.storage
      .from(MATERIALS_BUCKET)
      .createSignedUrl(row.storage_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function copyLink(row: MaterialRow) {
    const { data, error } = await supabase.storage
      .from(MATERIALS_BUCKET)
      .createSignedUrl(row.storage_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error(rlsErrorMessage(error));
      return;
    }
    try {
      await navigator.clipboard.writeText(data.signedUrl);
      toast.success('Link copied');
    } catch {
      toast.info(data.signedUrl);
    }
  }

  return (
    <div className="space-y-3">
      {isLeader && (
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <Button
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Spinner className="size-4" /> : <Upload className="size-4" />}
            {uploading ? 'Uploading…' : 'Upload material'}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No materials yet</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <EmptyDescription>
              Uploads will be stored for this class and stay available to the team.
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <Item key={row.id} variant="outline">
              <ItemMedia variant="icon">
                <FileText />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="truncate">{row.title}</ItemTitle>
                <ItemDescription>
                  {fmtDate(row.created_at)}
                  {sizeLabel(row.size_bytes) && ` · ${sizeLabel(row.size_bytes)}`}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button size="icon" variant="outline" onClick={() => copyLink(row)}>
                        <Link2 className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent>Copy link</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button size="icon" variant="outline" onClick={() => download(row)}>
                        <Download className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
              </ItemActions>
            </Item>
          ))}
        </div>
      )}
    </div>
  );
}