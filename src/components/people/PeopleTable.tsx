import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  flexRender,
  type VisibilityState,
} from '@tanstack/react-table';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PeopleTableToolbar, {
  ColumnVisibilityDropdown,
  type FilterState,
  type SortItem,
  type GroupState,
} from './PeopleTableToolbar';
import PersonDetailDrawer from './PersonDetailDrawer';
import AddPersonForm from './AddPersonForm';
import { defaultColumns, optionalColumns, DEFAULT_VISIBLE_COLUMNS, type Person } from './columns';

function toColumnFilters(filters: FilterState) {
  return Object.entries(filters)
    .filter(([, values]) => values.length > 0)
    .map(([id, value]) => ({ id, value }));
}

function toSortingState(sortItems: SortItem[], groupState?: GroupState) {
  const base = sortItems
    .filter((s) => s.field && s.field !== '')
    .map((s) => ({ id: s.field, desc: s.direction === 'desc' }));

  if (groupState && groupState.field) {
    return [
      { id: groupState.field, desc: groupState.direction === 'desc' },
      ...base.filter((s) => s.id !== groupState.field),
    ];
  }
  return base;
}

const globalFilterFn = (row: any, _columnId: string, filterValue: unknown) => {
  const q = String(filterValue ?? '').toLowerCase();
  if (!q) return true;
  const p = row.original as Person;
  const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
  const phone = (p.phone ?? '').toLowerCase();
  const location = (p.location ?? '').toLowerCase();
  return fullName.includes(q) || phone.includes(q) || location.includes(q);
};

export default function PeopleTable() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(buildDefaultVisibility());
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);

  const [sortItems, setSortItems] = useState<SortItem[]>([]);
  const [filters, setFilters] = useState<FilterState>({});
  const [groupState, setGroupState] = useState<GroupState>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const supabase = createClient();

  const allColumns = useMemo(() => [...defaultColumns, ...optionalColumns], []);

  const columnOrder = useMemo(
    () => allColumns.map((c) => (c as any).accessorKey ?? (c as any).id),
    [allColumns]
  );

  const columnSizeMap: Record<string, number> = {
    name: 180,
    phone: 160,
    date_registered: 120,
    m1_status: 120,
    category: 120,
    follow_up_status: 140,
    location: 160,
  };

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

  const columnFilterState = useMemo(() => toColumnFilters(filters), [filters]);
  const sortingState = useMemo(() => toSortingState(sortItems, groupState), [sortItems, groupState]);
  const groupingState = useMemo(
    () => (groupState ? [groupState.field] : []),
    [groupState]
  );
  const paginationState = useMemo(
    () => ({
      pageIndex,
      // When grouping is active, show every group at once (no pagination).
      pageSize: groupState ? Number.MAX_SAFE_INTEGER : pageSize,
    }),
    [pageIndex, pageSize, groupState]
  );

  const handlePaginationChange = useCallback(
    (updater: any) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize })
          : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    [pageIndex, pageSize]
  );

  const table = useReactTable({
    data: people,
    columns: allColumns,
    groupedColumnMode: false,
    state: {
      columnVisibility,
      columnOrder,
      globalFilter: search,
      columnFilters: columnFilterState,
      sorting: sortingState,
      grouping: groupingState,
      expanded: true,
      pagination: paginationState,
    },
    onGlobalFilterChange: setSearch,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: () => {},
    onPaginationChange: handlePaginationChange,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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

  const visibleIds = useMemo(
    () => table.getFilteredRowModel().rows.map((r) => r.original.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, people, filters, search]
  );
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && !allVisibleSelected;

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

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
        <ScrollArea className="w-full max-h-[calc(100vh-320px)] rounded-r-lg">
          <div className="min-w-[1100px]">
          <table className="w-full caption-bottom text-sm">
            <thead className="border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={someVisibleSelected}
                      onCheckedChange={toggleAllVisible}
                      aria-label="Select all rows"
                    />
                  </th>
                  {headerGroup.headers.map((header) => {
                    const colId = (header.column.columnDef as any).accessorKey ?? (header.column.columnDef as any).id;
                    return (
                      <th
                        key={header.id}
                        className="h-10 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap"
                        style={{ minWidth: columnSizeMap[colId] }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    );
                  })}
                  <th className="h-10 pr-2 pl-3 text-right align-middle w-8 sticky right-0 bg-background">
                    <ColumnVisibilityDropdown
                      visibleColumns={columnVisibility}
                      onToggle={(col, vis) =>
                        setColumnVisibility((prev) => ({ ...prev, [col]: vis }))
                      }
                      allColumnIds={allColumns.map(
                        (c) => (c as any).accessorKey ?? (c as any).id
                      )}
                    />
                  </th>
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
                if (row.getIsGrouped()) {
                  return (
                    <tr key={row.id} className="bg-muted/30 border-b">
                      <td
                        colSpan={allColumns.length + 1}
                        className="px-3 py-2"
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          {String(row.getValue(row.groupingColumnId!))} (
                          {row.subRows.length})
                        </span>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={row.id}
                    className={`border-b transition-colors hover:bg-muted/50 cursor-pointer ${selectedIds.has(row.original.id) ? 'bg-primary/5' : ''}`}
                    onClick={() => handleRowClick(row.original)}
                  >
                    <td className="px-3 py-2 w-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(row.original.id)}
                        onCheckedChange={() => toggleRow(row.original.id)}
                        aria-label="Select row"
                      />
                    </td>
                    {row.getVisibleCells().map((cell) => {
                      const colId = (cell.column.columnDef as any).accessorKey ?? (cell.column.columnDef as any).id;
                      return (
                        <td
                          key={cell.id}
                          className="px-3 py-2"
                          style={{ minWidth: columnSizeMap[colId] }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </ScrollArea>
      </div>

      {!groupState ? (
        <div className="flex items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-2">
            <label
              htmlFor="rows-per-page"
              className="whitespace-nowrap text-xs text-muted-foreground"
            >
              Rows per page
            </label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <p className="text-xs text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()} — {table.getFilteredRowModel().rows.length}{' '}
              people
            </p>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground px-1">
          Showing all {table.getFilteredRowModel().rows.length} people across{' '}
          {new Set(people.map((p) => (p as any)[groupState.field])).size} groups
        </p>
      )}

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

function buildDefaultVisibility(): VisibilityState {
  return Object.fromEntries(
    [...defaultColumns, ...optionalColumns].map((c) => {
      const id = (c as any).accessorKey ?? (c as any).id;
      return [id, (DEFAULT_VISIBLE_COLUMNS as readonly string[]).includes(id)];
    })
  );
}
