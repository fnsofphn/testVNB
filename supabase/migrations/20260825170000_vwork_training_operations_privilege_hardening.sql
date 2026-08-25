-- Least-privilege hardening for the isolated VWork Training Operations namespace.
-- History, audit, and idempotency rows are append-only for the API service role.

revoke all on table public.vwork_training_operations_state from service_role;
revoke all on table public.vwork_training_operations_tasks from service_role;
revoke all on table public.vwork_training_operations_task_history from service_role;
revoke all on table public.vwork_training_operations_audit_events from service_role;
revoke all on table public.vwork_training_operations_command_requests from service_role;

grant select, insert, update on table public.vwork_training_operations_state to service_role;
grant select, insert, update on table public.vwork_training_operations_tasks to service_role;
grant select, insert on table public.vwork_training_operations_task_history to service_role;
grant select, insert on table public.vwork_training_operations_audit_events to service_role;
grant select, insert on table public.vwork_training_operations_command_requests to service_role;

revoke all on sequence public.vwork_training_operations_task_history_history_id_seq from service_role;
grant usage, select on sequence public.vwork_training_operations_task_history_history_id_seq to service_role;

