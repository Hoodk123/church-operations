import { useMemo } from 'react';
import {
  ArrowUpDown,
  ListFilter,
  Rows3,
  Search,
  Columns3,
  Plus,
  X,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { type Person } from './columns';
import {
  filterFieldConfigs,
  sortFields,
  groupFields,
} from './constants';

export type FilterState = Record<string, string[]>;
export type SortItem = { field: string; direction: 'asc' | 'desc' };
export type GroupState = { field: string; direction: 'asc' | 'desc' } | null;

const fieldLabels: Record<string, string> = {
  category: 'Category',
  follow_up_status: 'Follow-up Status',
  gender: 'Gender',
  age_group: 'Age Group',
  m1_status: 'M1 Status',
  location: 'Location',
  assigned_to_name: 'Assigned To',
  phone: 'Phone',
  hbf_group: 'HBF Group',
  baptism_status: 'Baptism Status',
  how_found_church: 'How Found Church',
  notes: 'Notes',
  registered_by_name: 'Registered By',
  contact_preference: 'Preferred Contact',
  date_registered: 'Registered',
};

const visibilityGroups: { label: string; columns: string[] }[] = [
  { label: 'Contact', columns: ['phone', 'location', 'gender', 'age_group'] },
  {
    label: 'Church Journey',
    columns: ['category', 'm1_status', 'hbf_group', 'baptism_status', 'how_found_church', 'follow_up_status'],
  },
  {
    label: 'Record',
    columns: ['assigned_to_name', 'registered_by_name', 'date_registered', 'contact_preference', 'notes'],
  },
];

interface PeopleTableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddClick: () => void;
  sortItems: SortItem[];
  onSortChange: (items: SortItem[]) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  groupState: GroupState;
  onGroupChange: (state: GroupState) => void;
  people: Person[];
}

export default function PeopleTableToolbar({
  searchValue,
  onSearchChange,
  onAddClick,
  sortItems,
  onSortChange,
  filters,
  onFiltersChange,
  groupState,
  onGroupChange,
  people,
}: PeopleTableToolbarProps) {
  const activeFilterCount = useMemo(
    () => Object.values(filters).reduce((n, arr) => n + arr.length, 0),
    [filters]
  );

  const usedSortFields = useMemo(() => new Set(sortItems.map((s) => s.field)), [sortItems]);
  const firstUnusedSortField =
    sortFields.find((f) => !usedSortFields.has(f.value))?.value ?? '';

  function removeFilter(field: string, value: string) {
    const next = { ...filters };
    next[field] = (next[field] ?? []).filter((v) => v !== value);
    if (next[field].length === 0) delete next[field];
    onFiltersChange(next);
  }

  function clearAllFilters() {
    onFiltersChange({});
  }

  const dynamicValues = useMemo(() => {
    const locs = [...new Set(people.map((p) => p.location).filter(Boolean))] as string[];
    const assigned = [...new Set(people.map((p) => p.assigned_to_name).filter(Boolean))] as string[];
    return { location: locs.sort(), assigned_to_name: assigned.sort() };
  }, [people]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <SortDropdown sortItems={sortItems} onSortChange={onSortChange} />
        <FilterDropdown
          filters={filters}
          onFiltersChange={onFiltersChange}
          dynamicValues={dynamicValues}
        />
        <GroupDropdown groupState={groupState} onGroupChange={onGroupChange} />
        <SearchInput value={searchValue} onChange={onSearchChange} />

        <div className="w-2" />

        <div className="flex-1" />

        <Button size="sm" onClick={onAddClick} className="gap-1.5">
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {sortItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {sortItems.map((sort, idx) => (
            <div key={idx} className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs">
              <ArrowUpDown className="size-3 text-muted-foreground" />
              <span className="font-medium">
                {sortFields.find((f) => f.value === sort.field)?.label ?? sort.field}
              </span>
              <button
                onClick={() => {
                  const next = sortItems.map((s, i) =>
                    i === idx
                      ? { ...s, direction: (s.direction === 'asc' ? 'desc' : 'asc') as 'asc' | 'desc' }
                      : s
                  );
                  onSortChange(next);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {sort.direction === 'asc' ? '↑ A→Z' : '↓ Z→A'}
              </button>
              <button
                onClick={() => onSortChange(sortItems.filter((_, i) => i !== idx))}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              if (!firstUnusedSortField) return;
              onSortChange([
                ...sortItems,
                { field: firstUnusedSortField, direction: 'asc' },
              ]);
            }}
            disabled={!firstUnusedSortField}
            className={`text-xs underline transition-colors ${
              firstUnusedSortField
                ? 'text-muted-foreground hover:text-foreground'
                : 'text-muted-foreground/40 cursor-not-allowed'
            }`}
          >
            + Add sort
          </button>
        </div>
      )}

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(filters).map(([field, values]) =>
            values.map((val) => (
              <button
                key={`${field}-${val}`}
                onClick={() => removeFilter(field, val)}
                className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <span className="font-medium">{fieldLabels[field] ?? field}</span>
                <span>=</span>
                <span>{val}</span>
                <X className="size-3" />
              </button>
            ))
          )}
          <button
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function SortDropdown({ sortItems, onSortChange }: {
  sortItems: SortItem[];
  onSortChange: (items: SortItem[]) => void;
}) {
  const usedFields = new Set(sortItems.map((s) => s.field));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs" />}>
        <ArrowUpDown className="size-3.5" />
        Sort
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Add sort by</DropdownMenuLabel>
          {sortFields.map((f) => (
            <DropdownMenuItem
              key={f.value}
              disabled={usedFields.has(f.value)}
              onClick={() => {
                onSortChange([...sortItems, { field: f.value, direction: 'asc' }]);
              }}
            >
              {f.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function FilterDropdown({
  filters,
  onFiltersChange,
  dynamicValues,
}: {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  dynamicValues: Record<string, string[]>;
}) {
  function toggleValue(field: string, val: string) {
    const current = filters[field] ?? [];
    const next = current.includes(val)
      ? current.filter((v) => v !== val)
      : [...current, val];
    const nextFilters = { ...filters };
    if (next.length === 0) {
      delete nextFilters[field];
    } else {
      nextFilters[field] = next;
    }
    onFiltersChange(nextFilters);
  }

  const activeCount = Object.values(filters).reduce((n, arr) => n + arr.length, 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs" />}>
        <ListFilter className="size-3.5" />
        Filter
        {activeCount > 0 && (
          <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
            {activeCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-72">
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium text-muted-foreground">Filter by</p>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto pr-1">
          {filterFieldConfigs.map((field) => {
            const values =
              field.values.length > 0
                ? field.values
                : (dynamicValues[field.key] ?? []);
            if (values.length === 0) {
              return (
                <DropdownMenuGroup key={field.key}>
                  <DropdownMenuLabel className="text-xs">{field.label}</DropdownMenuLabel>
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    No values yet
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              );
            }
            const selected = filters[field.key] ?? [];
            return (
              <DropdownMenuGroup key={field.key}>
                <DropdownMenuLabel className="text-xs pt-2">{field.label}</DropdownMenuLabel>
                {values.map((val) => (
                  <DropdownMenuCheckboxItem
                    key={val}
                    checked={selected.includes(val)}
                    onCheckedChange={() => toggleValue(field.key, val)}
                  >
                    {val}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            );
          })}
        </div>
        {activeCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onFiltersChange({});
              }}
              className="text-destructive"
            >
              Clear all filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupDropdown({
  groupState,
  onGroupChange,
}: {
  groupState: GroupState;
  onGroupChange: (s: GroupState) => void;
}) {
  const currentLabel = groupState
    ? groupFields.find((f) => f.value === groupState.field)?.label ?? groupState.field
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs" />}>
        <Rows3 className="size-3.5" />
        Group by
        {currentLabel && (
          <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
            {currentLabel}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-56">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">Group by</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={groupState?.field ?? ''}
          onValueChange={(v) => {
            if (!v) {
              onGroupChange(null);
            } else {
              onGroupChange({
                field: v,
                direction: groupState !== null && groupState.field === v ? groupState.direction : 'asc',
              });
            }
          }}
        >
          {groupFields.map((f) => (
            <DropdownMenuRadioItem key={f.value} value={f.value}>
              {f.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {groupState && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1">
              <p className="text-[10px] text-muted-foreground mb-1">Direction</p>
              <div className="flex gap-1">
                <DropdownMenuItem
                  closeOnClick={false}
                  onClick={() => {
                    onGroupChange({ ...groupState, direction: 'asc' });
                  }}
                  className={`flex-1 justify-center text-[10px] ${groupState.direction === 'asc' ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  A → Z
                </DropdownMenuItem>
                <DropdownMenuItem
                  closeOnClick={false}
                  onClick={() => {
                    onGroupChange({ ...groupState, direction: 'desc' });
                  }}
                  className={`flex-1 justify-center text-[10px] ${groupState.direction === 'desc' ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  Z → A
                </DropdownMenuItem>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onGroupChange(null);
              }}
              className="text-destructive"
            >
              <Trash2 className="size-3.5" />
              Clear grouping
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        className="h-8 w-48 pl-8 text-sm"
      />
    </div>
  );
}

export function ColumnVisibilityDropdown({
  visibleColumns,
  onToggle,
  allColumnIds,
}: {
  visibleColumns: Record<string, boolean>;
  onToggle: (col: string, vis: boolean) => void;
  allColumnIds: string[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Columns3 className="size-4" />
        <span className="sr-only">Columns</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {visibilityGroups.map((group, gi) => {
          const groupCols = group.columns.filter((c) => allColumnIds.includes(c));
          if (groupCols.length === 0) return null;
          return (
            <span key={group.label}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {group.label}
                </DropdownMenuLabel>
                {groupCols.map((colId) => (
                  <DropdownMenuCheckboxItem
                    key={colId}
                    checked={visibleColumns[colId] !== false}
                    onCheckedChange={(checked) => onToggle(colId, checked)}
                  >
                    {fieldLabels[colId] ?? colId}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </span>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
