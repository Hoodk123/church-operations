import {
  ArrowUpDown,
  ListFilter,
  Rows3,
  Search,
  SlidersHorizontal,
  Columns3,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PeopleTableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (column: string, visible: boolean) => void;
  visibleColumnIds: string[];
  allColumnIds: string[];
  onAddClick: () => void;
}

export default function PeopleTableToolbar({
  searchValue,
  onSearchChange,
  columnVisibility,
  onColumnVisibilityChange,
  allColumnIds,
  onAddClick,
}: PeopleTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToolbarButton icon={ArrowUpDown} label="Sort" />
      <ToolbarButton icon={ListFilter} label="Filter" />
      <ToolbarButton icon={Rows3} label="Group by" />
      <SearchInput value={searchValue} onChange={onSearchChange} />
      <ToolbarButton icon={SlidersHorizontal} label="View options" />

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

function ToolbarButton({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Icon className="size-4" />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="rounded-full">{label}</TooltipContent>
    </Tooltip>
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
  const columnLabels: Record<string, string> = {
    name: 'Name',
    category: 'Category',
    follow_up_status: 'Follow-up Status',
    assigned_to_name: 'Assigned To',
    location: 'Location',
    date_registered: 'Registered',
    gender: 'Gender',
    m1_status: 'M1 Status',
    phone: 'Phone',
    age_group: 'Age Group',
    hbf_group: 'HBF Group',
    baptism_status: 'Baptism Status',
    how_found_church: 'How Found Church',
  };

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
