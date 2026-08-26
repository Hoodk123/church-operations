import { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  ListFilter,
  Rows3,
  Search,
  Columns3,
  Plus,
  X,
  Check,
  ChevronLeft,
  Trash2,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
};

interface PeopleTableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (column: string, visible: boolean) => void;
  allColumnIds: string[];
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
  columnVisibility,
  onColumnVisibilityChange,
  allColumnIds,
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

        <ColumnVisibilityDropdown
          visibleColumns={columnVisibility}
          onToggle={onColumnVisibilityChange}
          allColumnIds={allColumnIds}
        />

        <div className="flex-1" />

        <Button size="sm" onClick={onAddClick} className="gap-1.5">
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

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

function SortDropdown({
  sortItems,
  onSortChange,
}: {
  sortItems: SortItem[];
  onSortChange: (items: SortItem[]) => void;
}) {
  const isDateField = (f: string) => f === 'date_registered';

  function updateSort(index: number, patch: Partial<SortItem>) {
    const next = sortItems.map((s, i) =>
      i === index ? { ...s, ...patch } : s
    );
    onSortChange(next);
  }

  function removeSort(index: number) {
    onSortChange(sortItems.filter((_, i) => i !== index));
  }

  function addSort() {
    onSortChange([
      ...sortItems,
      { field: 'name', direction: 'asc' },
    ]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs" />}>
        <ArrowUpDown className="size-3.5" />
        Sort
        {sortItems.length > 0 && (
          <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
            {sortItems.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-72">
        <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {sortItems.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No sorts applied</p>
        )}

        {sortItems.map((sort, idx) => (
          <div key={idx} className="flex items-center gap-1 px-1 py-0.5">
            <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex-1 text-xs">
                {sortFields.find((f) => f.value === sort.field)?.label ?? sort.field}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {sortFields.map((f) => (
                  <DropdownMenuRadioItem
                    key={f.value}
                    value={f.value}
                    onSelect={() => updateSort(idx, { field: f.value })}
                  >
                    {f.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] shrink-0"
              onClick={() =>
                updateSort(idx, {
                  direction: sort.direction === 'asc' ? 'desc' : 'asc',
                })
              }
            >
              {isDateField(sort.field)
                ? sort.direction === 'asc'
                  ? 'Oldest'
                  : 'Newest'
                : sort.direction === 'asc'
                  ? 'A → Z'
                  : 'Z → A'}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              className="size-5 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeSort(idx)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}

        <DropdownMenuSeparator />
        <button
          onClick={addSort}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Plus className="size-3.5" />
          Add sort
        </button>
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
  const [level, setLevel] = useState<'fields' | 'values'>('fields');
  const [activeField, setActiveField] = useState('');
  const [search, setSearch] = useState('');

  function openField(key: string) {
    setActiveField(key);
    setLevel('values');
    setSearch('');
  }

  function goBack() {
    setLevel('fields');
    setActiveField('');
    setSearch('');
  }

  function toggleValue(val: string) {
    const current = filters[activeField] ?? [];
    const next = current.includes(val)
      ? current.filter((v) => v !== val)
      : [...current, val];
    const nextFilters = { ...filters };
    if (next.length === 0) {
      delete nextFilters[activeField];
    } else {
      nextFilters[activeField] = next;
    }
    onFiltersChange(nextFilters);
  }

  function handleClose() {
    setTimeout(() => {
      setLevel('fields');
      setActiveField('');
      setSearch('');
    }, 100);
  }

  const fieldConfig = filterFieldConfigs.find((f) => f.key === activeField);
  const valuesForField = fieldConfig
    ? fieldConfig.values.length > 0
      ? fieldConfig.values
      : (dynamicValues[activeField] ?? [])
    : [];
  const selectedValues = filters[activeField] ?? [];
  const filteredValues = search
    ? valuesForField.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : valuesForField;

  return (
    <DropdownMenu onOpenChange={(open) => !open && handleClose()}>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs" />}>
        <ListFilter className="size-3.5" />
        Filter
        {Object.values(filters).some((arr) => arr.length > 0) && (
          <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
            {Object.values(filters).reduce((n, arr) => n + arr.length, 0)}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-60">
        {level === 'fields' ? (
          <>
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-muted-foreground">Filter by</p>
            </div>
            <DropdownMenuSeparator />
            {filterFieldConfigs.map((field) => {
              const count = (filters[field.key] ?? []).length;
              return (
                <button
                  key={field.key}
                  onClick={() => openField(field.key)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  <span>{field.label}</span>
                  {count > 0 ? (
                    <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                      {count}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">›</span>
                  )}
                </button>
              );
            })}
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button onClick={goBack} className="rounded p-0.5 hover:bg-muted transition-colors">
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="text-xs font-medium">{fieldConfig?.label}</span>
            </div>
            <div className="px-2 pb-1.5">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-7 text-xs"
                autoFocus
              />
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-48 overflow-y-auto">
              {filteredValues.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No values found</p>
              )}
              {filteredValues.map((val) => {
                const checked = selectedValues.includes(val);
                return (
                  <button
                    key={val}
                    onClick={() => toggleValue(val)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                      checked ? 'bg-muted' : 'hover:bg-muted'
                    }`}
                  >
                    <div
                      className={`flex size-3.5 items-center justify-center rounded-sm border ${
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      {checked && <Check className="size-2.5" />}
                    </div>
                    <span>{val}</span>
                  </button>
                );
              })}
            </div>
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
          {groupState && (
            <button
              onClick={() => onGroupChange(null)}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="size-3" />
            </button>
          )}
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
                <Button
                  size="sm"
                  variant={groupState.direction === 'asc' ? 'default' : 'ghost'}
                  className="flex-1 text-[10px] h-6"
                  onClick={() => onGroupChange({ ...groupState, direction: 'asc' })}
                >
                  A → Z
                </Button>
                <Button
                  size="sm"
                  variant={groupState.direction === 'desc' ? 'default' : 'ghost'}
                  className="flex-1 text-[10px] h-6"
                  onClick={() => onGroupChange({ ...groupState, direction: 'desc' })}
                >
                  Z → A
                </Button>
              </div>
            </div>
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

function ColumnVisibilityDropdown({
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
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allColumnIds.map((colId) => (
          <DropdownMenuCheckboxItem
            key={colId}
            checked={visibleColumns[colId] !== false}
            onCheckedChange={(checked) => onToggle(colId, checked)}
          >
            {fieldLabels[colId] ?? colId}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
