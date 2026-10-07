export interface Attendance {
  id: string;
  person_id: string;
  service_date: string;
  service_name: string;
  checked_in_by: string | null;
  created_at: string;
}

export interface ContactLog {
  id: string;
  person_id: string;
  contacted_by: string | null;
  contacted_at: string;
  method: string;
  outcome: string;
  note: string | null;
  created_at: string;
}
