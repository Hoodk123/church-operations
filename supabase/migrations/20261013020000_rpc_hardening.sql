-- Security check follow-up (section 7): keep destructive and staff-only RPCs
-- out of reach of the anon role. The two public reply RPCs stay anon-callable
-- on purpose. Additive/grants only; no schema or data change.

-- Admin-only deletes.
revoke execute on function public.delete_m1_class(uuid) from anon;
revoke execute on function public.delete_baptism_event(uuid) from anon;
grant execute on function public.delete_m1_class(uuid) to authenticated;
grant execute on function public.delete_baptism_event(uuid) to authenticated;

-- Staff-only helpers that were created with default PUBLIC execute.
revoke execute on function public.close_m1_session(uuid) from public, anon;
revoke execute on function public.issue_m1_certificates(uuid[]) from public, anon;
revoke execute on function public.m1_waiting_list() from public, anon;
revoke execute on function public.baptism_candidates() from public, anon;

grant execute on function public.close_m1_session(uuid) to authenticated;
grant execute on function public.issue_m1_certificates(uuid[]) to authenticated;
grant execute on function public.m1_waiting_list() to authenticated;
grant execute on function public.baptism_candidates() to authenticated;
