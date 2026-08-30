import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { categoryColors, followUpStatusColors } from './constants';

export interface Person {
  id: string;
  first_name: string;
  last_name: string;
  gender: string;
  age_group: string | null;
  phone: string;
  location: string | null;
  category: string;
  m1_status: string | null;
  hbf_group: string | null;
  how_found_church: string | null;
  date_registered: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  follow_up_status: string;
  last_contact_date: string | null;
  baptism_status: string | null;
  notes: string | null;
  registered_by: string | null;
  registered_by_name: string | null;
  contact_preference: string | null;
  created_at: string;
  updated_at: string;
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateStr));
}

// Our Filter menu stores an array of selected values per field (multi-select
// checkboxes). TanStack's default filter fns expect a single value, so give
// every filterable column an explicit fn that matches against the array.
const multiValueFilterFn = (
  row: any,
  columnId: string,
  filterValue: string[]
) => {
  if (!filterValue || filterValue.length === 0) return true;
  return filterValue.includes(row.getValue(columnId));
};

/**
 * Default visible columns reflect the three questions that matter most in
 * person-to-person ministry — "who needs baptism," "who doesn't have an HBF
 * group yet," and "who wants/is attending M1 classes." These must be scannable
 * across the whole table without opening a drawer. Everything else (Phone,
 * Gender, Age Group, Assigned To, How Found Church, Registered By, Notes,
 * Contact Preference, Date Registered) is hidden by default and opt-in via the
 * header's column menu.
 */
export const DEFAULT_VISIBLE_COLUMNS = [
  'name',
  'category',
  'baptism_status',
  'm1_status',
  'hbf_group',
  'follow_up_status',
  'location',
] as const;

export const defaultColumns: ColumnDef<Person, any>[] = [
  {
    id: 'name',
    header: 'Name',
    // Accessor used for sorting — surname-first so "Sort by Name" orders by
    // last name (roster/attendance convention). Display is handled by the
    // cell below and stays given-name-first.
    accessorFn: (row) => `${row.last_name} ${row.first_name}`,
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.first_name} {row.original.last_name}
      </span>
    ),
    enableHiding: false,
  },
];

export const optionalColumns: ColumnDef<Person, any>[] = [
  {
    accessorKey: 'category',
    header: 'Category',
    filterFn: multiValueFilterFn,
    cell: ({ getValue }) => {
      const val = getValue<string>();
      return (
        <Badge variant="outline" className={categoryColors[val] ?? ''}>
          {val}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'follow_up_status',
    header: 'Follow-up Status',
    filterFn: multiValueFilterFn,
    cell: ({ getValue }) => {
      const val = getValue<string>();
      return (
        <Badge variant="outline" className={followUpStatusColors[val] ?? ''}>
          {val}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'assigned_to_name',
    header: 'Assigned To',
    filterFn: multiValueFilterFn,
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ? (
        <span className="whitespace-nowrap">{val}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ getValue }) => {
      const val = getValue<string>();
      return <span className="whitespace-nowrap">{val}</span>;
    },
  },
  {
    accessorKey: 'date_registered',
    header: 'Registered',
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap">{formatDate(getValue<string>())}</span>
    ),
  },
  {
    accessorKey: 'location',
    header: 'Location',
    filterFn: multiValueFilterFn,
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'gender',
    header: 'Gender',
    filterFn: multiValueFilterFn,
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'm1_status',
    header: 'M1 Status',
    filterFn: multiValueFilterFn,
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'age_group',
    header: 'Age Group',
    filterFn: multiValueFilterFn,
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'hbf_group',
    header: 'HBF Group',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'baptism_status',
    header: 'Baptism Status',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'how_found_church',
    header: 'How Found Church',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'registered_by_name',
    header: 'Registered By',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'contact_preference',
    header: 'Preferred Contact',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'notes',
    header: 'Notes',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ? (
        <span className="line-clamp-2 text-xs text-muted-foreground">{val}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
];
