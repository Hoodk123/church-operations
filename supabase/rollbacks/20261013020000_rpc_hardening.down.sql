-- Revert the RPC execute hardening. Restores the anon/PUBLIC grants that the
-- Supabase default privileges originally applied to these functions.

grant execute on function public.delete_m1_class(uuid) to anon;
grant execute on function public.delete_baptism_event(uuid) to anon;

grant execute on function public.close_m1_session(uuid) to public, anon;
grant execute on function public.issue_m1_certificates(uuid[]) to public, anon;
grant execute on function public.m1_waiting_list() to public, anon;
grant execute on function public.baptism_candidates() to public, anon;
