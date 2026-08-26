import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type VisibilityState,
} from '@tanstack/react-table';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import PeopleTableToolbar, {
  type FilterState,
  type SortItem,
  type GroupState,
} from './PeopleTableToolbar';
import PersonDetailDrawer from './PersonDetailDrawer';
import AddPersonForm from './AddPersonForm';
import { defaultColumns, optionalColumns, type Person } from './columns';

export default function PeopleTable() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);

  const [sortItems, setSortItems] = useState<SortItem[]>([]);
  const [filters, setFilters] = useState<FilterState>({});
  const [groupState, setGroupState] = useState<GroupState>(null);

  const supabase = createClient();

  const allColumns = useMemo(() => [...defaultColumns, ...optionalColumns], []);

  const loadPeople = useCallback(async () => {
    const { data } = await supabase
      .from('people')
      .select('*, assigned_to_name:team_members!people_assigned_to_fkey(full_name), registered_by_name:team_members!people_registered_by_fkey(full_name)')
      .order('updated_at', { ascending: false });

    if (data) {
      setPeople(
        data.map((r: any) => ({
          ...r,
          assigned_to_name: r.assigned_to_name?.full_name ?? null,
          registered_by_name: r.registered_by_name?.full_name ?? null,
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

    // Apply multi-field filters (AND across fields, OR within field)
    for (const [field, values] of Object.entries(filters)) {
      if (values.length > 0) {
        result = result.filter((p) => {
          const val = (p as any)[field];
          return values.includes(val);
        });
      }
    }

    // Apply global search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => {
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const phone = (p.phone ?? '').toLowerCase();
        const location = (p.location ?? '').toLowerCase();
        return fullName.includes(q) || phone.includes(q) || location.includes(q);
      });
    }

    // Apply multi-sort (first item is primary sort)
    if (sortItems.length > 0) {
      result.sort((a, b) => {
        for (const sort of sortItems) {
          const aVal = (a as any)[sort.field] ?? '';
          const bVal = (b as any)[sort.field] ?? '';
          const cmp = String(aVal).localeCompare(String(bVal));
          if (cmp !== 0) return sort.direction === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }

    return result;
  }, [people, filters, sortItems, search]);

  const groupedPeople = useMemo(() => {
    if (!groupState) return null;
    const groups: Record<string, Person[]> = {};
    for (const person of filteredPeople) {
      const key = (person as any)[groupState.field] ?? 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(person);
    }

    // Sort groups by key
    const sorted = Object.entries(groups).sort(([a], [b]) => {
      const cmp = a.localeCompare(b);
      return groupState.direction === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [filteredPeople, groupState]);

  const tableData = useMemo(() => {
    if (groupedPeople) {
      return groupedPeople.flatMap(([_group, persons]) => [
        { _isGroup: true, _groupLabel: _group, _count: persons.length } as any,
        ...persons,
      ]);
    }
    return filteredPeople;
  }, [groupedPeople, filteredPeople]);

  const table = useReactTable({
    data: tableData,
    columns: allColumns,
    state: {
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row: any) => (row._isGroup ? `group-${row._groupLabel}` : row.id),
  });

  const handleRowClick = (person: Person) => {
    setSelectedPerson(person);
    setDrawerOpen(true);
  };

  const handlePersonUpdated = (updated: Person) => {
    setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedPerson(updated);
  };

  const handlePersonDeleted = (id: string) => {
    setPeople((prev) => prev.filter((p) => p.id !== id));
    setDrawerOpen(false);
    setSelectedPerson(null);
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
        allColumnIds={allColumns.map(
          (c) => (c as any).accessorKey ?? (c as any).id
        )}
        onAddClick={() => setAddFormOpen(true)}
        sortItems={sortItems}
        onSortChange={setSortItems}
        filters={filters}
        onFiltersChange={setFilters}
        groupState={groupState}
        onGroupChange={setGroupState}
        people={people}
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
                      <td
                        colSpan={allColumns.length + 1}
                        className="px-3 py-2"
                      >
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
          onDeleted={handlePersonDeleted}
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
