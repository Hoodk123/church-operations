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

export const defaultColumns: ColumnDef<Person, any>[] = [
  {
    id: 'name',
    header: 'Name',
    accessorFn: (row) => `${row.first_name} ${row.last_name}`,
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.first_name} {row.original.last_name}
      </span>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'category',
    header: 'Category',
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
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ? (
        <span>{val}</span>
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      );
    },
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
  },
  {
    accessorKey: 'date_registered',
    header: 'Registered',
    cell: ({ getValue }) => formatDate(getValue<string>()),
  },
];

export const optionalColumns: ColumnDef<Person, any>[] = [
  {
    accessorKey: 'location',
    header: 'Location',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
  {
    accessorKey: 'gender',
    header: 'Gender',
  },
  {
    accessorKey: 'm1_status',
    header: 'M1 Status',
  },
  {
    accessorKey: 'age_group',
    header: 'Age Group',
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
  },
  {
    accessorKey: 'how_found_church',
    header: 'How Found Church',
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ?? <span className="text-muted-foreground">—</span>;
    },
  },
];
