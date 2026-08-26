import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import PeopleTableToolbar from './PeopleTableToolbar';
import PersonDetailDrawer from './PersonDetailDrawer';
import AddPersonForm from './AddPersonForm';
import { defaultColumns, optionalColumns, type Person } from './columns';

export default function PeopleTable() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);

  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterFollowUp, setFilterFollowUp] = useState('');
  const [groupBy, setGroupBy] = useState('');

  const supabase = createClient();

  const allColumns = useMemo(() => [...defaultColumns, ...optionalColumns], []);

  const loadPeople = useCallback(async () => {
    const { data } = await supabase
      .from('people')
      .select('*, assigned_to_name:team_members!people_assigned_to_fkey(full_name)')
      .order('updated_at', { ascending: false });

    if (data) {
      setPeople(
        data.map((r: any) => ({
          ...r,
          assigned_to_name: r.assigned_to_name?.full_name ?? null,
        }))
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const filteredPeople = useMemo(() => {
    let result = [...people];

    if (filterCategory) {
      result = result.filter((p) => p.category === filterCategory);
    }
    if (filterFollowUp) {
      result = result.filter((p) => p.follow_up_status === filterFollowUp);
    }

    result.sort((a, b) => {
      const aVal = (a as any)[sortField] ?? '';
      const bVal = (b as any)[sortField] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [people, filterCategory, filterFollowUp, sortField, sortDirection]);

  const groupedPeople = useMemo(() => {
    if (!groupBy) return null;
    const groups: Record<string, Person[]> = {};
    for (const person of filteredPeople) {
      const key = (person as any)[groupBy] ?? 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(person);
    }
    return groups;
  }, [filteredPeople, groupBy]);

  const tableData = groupedPeople
    ? Object.entries(groupedPeople).flatMap(([group, persons]) => [
        { _isGroup: true, _groupLabel: group, _count: persons.length } as any,
        ...persons,
      ])
    : filteredPeople;

  const table = useReactTable({
    data: tableData,
    columns: allColumns,
    state: {
      sorting,
      columnVisibility,
      globalFilter: search,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row: any) => row._isGroup ? `group-${row._groupLabel}` : row.id,
  });

  const handleRowClick = (person: Person) => {
    setSelectedPerson(person);
    setDrawerOpen(true);
  };

  const handlePersonUpdated = (updated: Person) => {
    setPeople((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
    setSelectedPerson(updated);
  };

  if (loading) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Loading people...
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <PeopleTableToolbar
        searchValue={search}
        onSearchChange={setSearch}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={(col, vis) =>
          setColumnVisibility((prev) => ({ ...prev, [col]: vis }))
        }
        visibleColumnIds={allColumns
          .filter((c) => {
            const id = (c as any).accessorKey ?? (c as any).id;
            return columnVisibility[id] !== false;
          })
          .map((c) => (c as any).accessorKey ?? (c as any).id)}
        allColumnIds={allColumns.map(
          (c) => (c as any).accessorKey ?? (c as any).id
        )}
        onAddClick={() => setAddFormOpen(true)}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={(field, dir) => { setSortField(field); setSortDirection(dir); }}
        filterCategory={filterCategory}
        filterFollowUp={filterFollowUp}
        onFilterChange={(cat, fu) => { setFilterCategory(cat); setFilterFollowUp(fu); }}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
      />

      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground w-10">
                    <Checkbox />
                  </th>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="h-10 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td
                    colSpan={allColumns.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No people found.
                  </td>
                </tr>
              )}
              {table.getRowModel().rows.map((row) => {
                const rowData = row.original as any;
                if (rowData._isGroup) {
                  return (
                    <tr key={row.id} className="bg-muted/30 border-b">
                      <td colSpan={allColumns.length + 1} className="px-3 py-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {rowData._groupLabel} ({rowData._count})
                        </span>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={row.id}
                    className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleRowClick(row.original)}
                  >
                    <td className="px-3 py-2 w-10">
                      <Checkbox />
                    </td>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <PersonDetailDrawer
          person={selectedPerson}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onUpdated={handlePersonUpdated}
        />
      )}

      <AddPersonForm
        open={addFormOpen}
        onOpenChange={setAddFormOpen}
        onCreated={loadPeople}
      />
    </div>
  );
}
