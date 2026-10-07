export const categoryColors: Record<string, string> = {
  Visitor: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  'New Convert': 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800',
  'M1 Class': 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  Member: 'bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-neutral-900/30 dark:text-neutral-400 dark:border-neutral-800',
  Returning: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
  Counseling: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800',
};

export const followUpStatusColors: Record<string, string> = {
  'Not Started': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  Contacted: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  Met: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  Ongoing: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
  Completed: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
};

export const categories = ['Visitor', 'New Convert', 'M1 Class', 'Member', 'Returning', 'Counseling'] as const;
export const followUpStatuses = ['Not Started', 'Contacted', 'Met', 'Ongoing', 'Completed'] as const;
export const m1Statuses = ['Not Started', 'In Progress', 'Completed'] as const;
export const baptismStatuses = ['Not yet', 'Scheduled', 'Baptized'] as const;
export const ageGroups = ['Child', 'Youth', 'Adult', 'Elderly'] as const;
export const genders = ['Male', 'Female'] as const;

export const filterFieldConfigs = [
  { key: 'category', label: 'Category', values: [...categories] },
  { key: 'follow_up_status', label: 'Follow-up Status', values: [...followUpStatuses] },
  { key: 'gender', label: 'Gender', values: [...genders] },
  { key: 'age_group', label: 'Age Group', values: [...ageGroups] },
  { key: 'm1_status', label: 'M1 Status', values: [...m1Statuses] },
  { key: 'baptism_status', label: 'Baptism Status', values: [...baptismStatuses] },
  { key: 'location', label: 'Location', values: [] },
  { key: 'hbf_group', label: 'HBF Group', values: [] },
  { key: 'assigned_to_name', label: 'Assigned To', values: [] },
] as const;

export const sortFields = [
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'follow_up_status', label: 'Follow-up Status' },
  { value: 'date_registered', label: 'Date Registered' },
  { value: 'assigned_to_name', label: 'Assigned To' },
  { value: 'location', label: 'Location' },
  { value: 'hbf_group', label: 'HBF Group' },
  { value: 'gender', label: 'Gender' },
  { value: 'age_group', label: 'Age Group' },
  { value: 'baptism_status', label: 'Baptism Status' },
  { value: 'm1_status', label: 'M1 Status' },
];

export const groupFields = [
  { value: 'category', label: 'Category' },
  { value: 'follow_up_status', label: 'Follow-up Status' },
  { value: 'age_group', label: 'Age Group' },
  { value: 'm1_status', label: 'M1 Status' },
  { value: 'baptism_status', label: 'Baptism Status' },
  { value: 'location', label: 'Location' },
  { value: 'hbf_group', label: 'HBF Group' },
  { value: 'assigned_to_name', label: 'Assigned To' },
];
