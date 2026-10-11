-- Rollback for 20261012000000_m1_baptism.sql (Task 6).
-- New objects are dropped; the widened people.contact_preference check is put
-- back to its earlier value. The m1-materials Storage bucket must be emptied
-- and removed from the dashboard (or with the Storage API); SQL cannot delete a
-- bucket that still holds files.

drop function if exists public.submit_absence_reply(text, text, text);
drop function if exists public.get_reply_context(text);
drop function if exists public.baptism_candidates();
drop function if exists public.m1_waiting_list();
drop function if exists public.issue_m1_certificates(uuid[]);
drop function if exists public.close_m1_session(uuid);
drop trigger  if exists baptism_registration_sync on public.baptism_registrations;
drop function if exists public.baptism_registration_sync();
drop trigger  if exists m1_attendance_touch on public.m1_attendance;
drop function if exists public.m1_attendance_touch_person();

drop policy if exists m1_materials_files_read   on storage.objects;
drop policy if exists m1_materials_files_write  on storage.objects;
drop policy if exists m1_materials_files_delete on storage.objects;

drop table if exists public.baptism_registrations;
drop table if exists public.baptism_events;
drop table if exists public.m1_materials;
drop table if exists public.m1_absence_replies;
drop table if exists public.m1_reply_links;
drop table if exists public.m1_message_log;
drop table if exists public.m1_attendance;
drop table if exists public.m1_enrollments;
drop table if exists public.m1_sessions;
drop table if exists public.m1_classes;
drop sequence if exists public.m1_certificate_seq;

drop function if exists public.is_class_leader();
drop function if exists public.is_class_staff();

alter table public.message_templates drop column if exists purpose;

alter table public.people
  drop column if exists needs_baptism,
  drop column if exists needs_m1,
  drop column if exists address_details,
  drop column if exists email;

alter table public.people
  drop constraint if exists people_contact_preference_check;
alter table public.people
  add constraint people_contact_preference_check
  check (contact_preference in ('WhatsApp','SMS','Both'));
