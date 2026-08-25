-- Manual rollback for the isolated VWork Training Operations schema.
-- Run only after exporting any VWork data that must be retained.
-- The private Storage bucket is intentionally not deleted to avoid removing uploaded evidence.

begin;

drop function if exists public.persist_vwork_training_operations_state(
  text,
  bigint,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb
);

drop trigger if exists set_vwork_training_operations_task_updated_at
  on public.vwork_training_operations_tasks;
drop trigger if exists set_vwork_training_operations_state_updated_at
  on public.vwork_training_operations_state;

drop table if exists public.vwork_training_operations_command_requests;
drop table if exists public.vwork_training_operations_audit_events;
drop table if exists public.vwork_training_operations_task_history;
drop table if exists public.vwork_training_operations_tasks;
drop table if exists public.vwork_training_operations_state;

drop function if exists public.set_vwork_training_operations_updated_at();

commit;
