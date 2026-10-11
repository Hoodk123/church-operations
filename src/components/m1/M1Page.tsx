import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, Plus, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { rlsErrorMessage } from '@/lib/rls-error';
import { useShellMember } from '@/components/layout/shell';
import ScreenHeader from '@/components/layout/ScreenHeader';
import { venueLabel, type M1Class } from '@/components/m1/m1';
import EnrolledTab from '@/components/m1/EnrolledTab';
import AddSheet from '@/components/m1/AddSheet';
import NewClassDialog from '@/components/m1/NewClassDialog';
import { NeedsM1Tab } from '@/components/m1/NeedsM1Tab';
import { MissedTab } from '@/components/m1/MissedTab';
import { MaterialsTab } from '@/components/m1/MaterialsTab';
import { CertificatesTab } from '@/components/m1/CertificatesTab';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TabKey = 'enrolled' | 'needs' | 'missed' | 'materials' | 'certificates';

export default function M1Page() {
  const member = useShellMember();
  const supabase = createClient();

  const role = member?.role;
  const isAdmin = role === 'Admin';
  const isLeader = role === 'Admin' || role === 'Pastor' || role === 'Follow-up Coordinator';

  const [classes, setClasses] = useState<M1Class[]>([]);
  const [classId, setClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('enrolled');
  const [addOpen, setAddOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('m1_classes')
      .select('id, title, venue, required_days, status, created_by, created_at')
      .order('status', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(rlsErrorMessage(error));
      setClasses([]);
    } else {
      const rows = (data ?? []) as M1Class[];
      setClasses(rows);
      setClassId((prev) =>
        prev && rows.some((k) => k.id === prev)
          ? prev
          : (rows.find((k) => k.status === 'Open')?.id ?? rows[0]?.id ?? null)
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const klass = useMemo(() => classes.find((k) => k.id === classId) ?? null, [classes, classId]);

  const supportsTabs = isLeader && !!klass;

  return (
    <div className="flex flex-col gap-4 pb-16 md:pb-0">
      <ScreenHeader
        title="M1 Class"
        sub="New-member classes, attendance and certificates"
        action={
          isAdmin && (
            <Button onClick={() => setNewOpen(true)}>
              <CalendarPlus className="size-4" />
              New class
            </Button>
          )
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : classes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No classes yet</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <EmptyDescription>
              {isAdmin
                ? 'Create your first M1 class to get started.'
                : 'There are no M1 classes to show yet.'}
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={classId ?? undefined} onValueChange={(v) => setClassId(v)}>
              <SelectTrigger className="max-w-60">
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    <span className={k.status === 'Closed' ? 'line-through opacity-60' : ''}>
                      {k.title}
                    </span>
                    {k.status === 'Closed' && ' (closed)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {klass && (
              <>
                <Badge variant={klass.status === 'Open' ? 'default' : 'outline'}>
                  {klass.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {klass.required_days} days · {venueLabel(klass.venue)}
                </span>
              </>
            )}
            <Button
              variant="outline"
              className="ml-auto hidden md:inline-flex"
              disabled={!klass}
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-4" />
              Add member
            </Button>
          </div>

          {klass && supportsTabs ? (
            <Tabs value={tab} onValueChange={(v) => setTab((v ?? 'enrolled') as TabKey)}>
              <TabsList className="w-full overflow-x-auto sm:w-fit">
                <TabsTrigger value="enrolled">Enrolled</TabsTrigger>
                <TabsTrigger value="needs">Needs M1</TabsTrigger>
                <TabsTrigger value="missed">Missed a day</TabsTrigger>
                <TabsTrigger value="materials">Materials</TabsTrigger>
                <TabsTrigger value="certificates">Certificates</TabsTrigger>
              </TabsList>

              <TabsContent value="enrolled" className="mt-4">
                <EnrolledTab
                  key={classId}
                  klass={klass}
                  isAdmin={isAdmin}
                  isLeader={isLeader}
                  onChanged={loadClasses}
                />
              </TabsContent>
              <TabsContent value="needs" className="mt-4">
                <NeedsM1Tab key={classId} klass={klass} isAdmin={isAdmin} onChanged={loadClasses} />
              </TabsContent>
              <TabsContent value="missed" className="mt-4">
                <MissedTab key={classId} klass={klass} isLeader={isLeader} onChanged={loadClasses} />
              </TabsContent>
              <TabsContent value="materials" className="mt-4">
                <MaterialsTab key={classId} klass={klass} onChanged={loadClasses} />
              </TabsContent>
              <TabsContent value="certificates" className="mt-4">
                <CertificatesTab key={classId} klass={klass} onChanged={loadClasses} />
              </TabsContent>
            </Tabs>
          ) : (
            klass && (
              <EnrolledTab
                key={classId}
                klass={klass}
                isAdmin={isAdmin}
                isLeader={isLeader}
                onChanged={loadClasses}
              />
            )
          )}
        </>
      )}

      <div className="fixed inset-x-0 bottom-[4.25rem] z-30 px-4 md:hidden">
        <Button
          size="lg"
          className="h-12 w-full text-base shadow-lg"
          disabled={!klass}
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-4" />
          Add member
        </Button>
      </div>

      {klass && (
        <AddSheet
          open={addOpen}
          onOpenChange={setAddOpen}
          classId={klass.id}
          onAdded={loadClasses}
        />
      )}

      <NewClassDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => {
          setClassId(id);
          setTab('enrolled');
          loadClasses();
        }}
      />
    </div>
  );
}