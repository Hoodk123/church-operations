import { useState } from 'react';
import {
  ArrowUpDown,
  ListFilter,
  Rows3,
  Search,
  Columns3,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { categories, followUpStatuses } from './constants';

interface PeopleTableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (column: string, visible: boolean) => void;
  visibleColumnIds: string[];
  allColumnIds: string[];
  onAddClick: () => void;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (field: string, direction: 'asc' | 'desc') => void;
  filterCategory: string;
  filterFollowUp: string;
  onFilterChange: (category: string, followUp: string) => void;
  groupBy: string;
  onGroupByChange: (field: string) => void;
}

const sortOptions = [
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'follow_up_status', label: 'Follow-up Status' },
  { value: 'date_registered', label: 'Date Registered' },
  { value: 'assigned_to_name', label: 'Assigned To' },
];

const groupOptions = [
  { value: '', label: 'None' },
  { value: 'category', label: 'Category' },
  { value: 'follow_up_status', label: 'Follow-up Status' },
  { value: 'assigned_to_name', label: 'Assigned To' },
];

const columnLabels: Record<string, string> = {
  name: 'Name',
  category: 'Category',
  follow_up_status: 'Follow-up Status',
  assigned_to_name: 'Assigned To',
  phone: 'Phone',
  date_registered: 'Registered',
  location: 'Location',
  gender: 'Gender',
  m1_status: 'M1 Status',
  age_group: 'Age Group',
  hbf_group: 'HBF Group',
  baptism_status: 'Baptism Status',
  how_found_church: 'How Found Church',
};

export default function PeopleTableToolbar({
  searchValue,
  onSearchChange,
  columnVisibility,
  onColumnVisibilityChange,
  allColumnIds,
  onAddClick,
  sortField,
  sortDirection,
  onSortChange,
  filterCategory,
  filterFollowUp,
  onFilterChange,
  groupBy,
  onGroupByChange,
}: PeopleTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <SortPopover
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />
      <FilterPopover
        filterCategory={filterCategory}
        filterFollowUp={filterFollowUp}
        onFilterChange={onFilterChange}
      />
      <GroupByPopover groupBy={groupBy} onGroupByChange={onGroupByChange} />
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
  );
}

function SortPopover({
  sortField,
  sortDirection,
  onSortChange,
}: {
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSortChange: (field: string, direction: 'asc' | 'desc') => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs" />}>
        <ArrowUpDown className="size-3.5" />
        Sort
        <ChevronDown className="size-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-56 p-2">
        <p className="text-xs font-medium text-muted-foreground mb-2">Sort by</p>
        <DropdownMenuRadioGroup
          value={sortField}
          onValueChange={(v) => onSortChange(v, sortDirection)}
        >
          {sortOptions.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <Separator className="my-2" />
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={sortDirection === 'asc' ? 'default' : 'ghost'}
            className="flex-1 text-xs"
            onClick={() => onSortChange(sortField, 'asc')}
          >
            A → Z
          </Button>
          <Button
            size="sm"
            variant={sortDirection === 'desc' ? 'default' : 'ghost'}
            className="flex-1 text-xs"
            onClick={() => onSortChange(sortField, 'desc')}
          >
            Z → A
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterPopover({
  filterCategory,
  filterFollowUp,
  onFilterChange,
}: {
  filterCategory: string;
  filterFollowUp: string;
  onFilterChange: (category: string, followUp: string) => void;
}) {
  const [localCategory, setLocalCategory] = useState(filterCategory);
  const [localFollowUp, setLocalFollowUp] = useState(filterFollowUp);

  function applyFilters() {
    onFilterChange(localCategory, localFollowUp);
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs" />}>
        <ListFilter className="size-3.5" />
        Filter
        <ChevronDown className="size-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-64 p-3 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <select
            value={localCategory}
            onChange={(e) => setLocalCategory(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Follow-up Status</Label>
          <select
            value={localFollowUp}
            onChange={(e) => setLocalFollowUp(e.target.value)}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none"
          >
            <option value="">All statuses</option>
            {followUpStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 text-xs"
            onClick={() => { setLocalCategory(''); setLocalFollowUp(''); onFilterChange('', ''); }}
          >
            Clear
          </Button>
          <Button size="sm" className="flex-1 text-xs" onClick={applyFilters}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupByPopover({
  groupBy,
  onGroupByChange,
}: {
  groupBy: string;
  onGroupByChange: (field: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="gap-1.5 text-xs" />}>
        <Rows3 className="size-3.5" />
        Group by
        <ChevronDown className="size-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-56 p-2">
        <p className="text-xs font-medium text-muted-foreground mb-2">Group rows by</p>
        <DropdownMenuRadioGroup
          value={groupBy}
          onValueChange={onGroupByChange}
        >
          {groupOptions.map((opt) => (
            <DropdownMenuRadioItem key={opt.value} value={opt.value}>
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </PopoverContent>
    </Popover>
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
            {columnLabels[colId] ?? colId}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
