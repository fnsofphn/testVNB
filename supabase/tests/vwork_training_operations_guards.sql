-- Run only after 20260824155749_vwork_training_operations.sql.
-- The outer transaction always rolls back: this test leaves no VWork rows behind.
begin;
set local role service_role;

do $$
declare
  v_state_id constant text := '__vwork_training_operations_guard_test__';
  v_actor constant jsonb := '{"id":"guard-test","email":"guard-test@peopleone.vn","name":"Guard test","role":"admin"}'::jsonb;
  v_tasks jsonb := '[
    {"id":"T-GUARD-01","projectId":"P-GUARD","courseId":"C-GUARD","classId":"L-GUARD","classCode":"L01","group":"setup","status":"READY","assigneeId":"u1","assignee":"User 1","checklist":[false]},
    {"id":"T-GUARD-02","projectId":"P-GUARD","courseId":"C-GUARD","classId":"L-GUARD","classCode":"L01","group":"delivery","status":"READY","assigneeId":"u2","assignee":"User 2","checklist":[false]}
  ]'::jsonb;
  v_result jsonb;
  v_version bigint;
  v_snapshot jsonb;
begin
  v_result := public.persist_vwork_training_operations_state(
    v_state_id, 0, '10000000-0000-4000-8000-000000000001'::uuid, 'GUARD_SEED', 'P-GUARD',
    '{"activeProjectId":"P-GUARD","projects":[],"courses":[],"classes":[]}'::jsonb,
    v_tasks,
    '[{"id":"A-GUARD-01","type":"GUARD_SEED","summary":"Seed guard test","happenedAt":"2026-08-25T00:00:00Z"}]'::jsonb,
    v_actor
  );
  if (v_result ->> 'version')::bigint <> 1 then raise exception 'GUARD_INITIAL_VERSION_FAILED'; end if;
  if (select count(*) from public.vwork_training_operations_tasks where state_id = v_state_id) <> 2 then raise exception 'GUARD_TASK_ROW_COUNT_FAILED'; end if;
  if (select count(*) from public.vwork_training_operations_task_history where state_id = v_state_id) <> 2 then raise exception 'GUARD_TASK_HISTORY_FAILED'; end if;

  -- Same request is a replay, not a duplicate mutation.
  v_result := public.persist_vwork_training_operations_state(
    v_state_id, 0, '10000000-0000-4000-8000-000000000001'::uuid, 'GUARD_SEED', 'P-GUARD',
    '{"activeProjectId":"P-GUARD","projects":[],"courses":[],"classes":[]}'::jsonb, v_tasks, '[]'::jsonb, v_actor
  );
  if coalesce((v_result ->> 'idempotentReplay')::boolean, false) is not true then raise exception 'GUARD_IDEMPOTENCY_FAILED'; end if;
  if (select version from public.vwork_training_operations_state where id = v_state_id) <> 1 then raise exception 'GUARD_RETRY_CHANGED_VERSION'; end if;

  -- A stale client must lose without changing state.
  begin
    perform public.persist_vwork_training_operations_state(
      v_state_id, 0, '10000000-0000-4000-8000-000000000002'::uuid, 'GUARD_STALE', 'P-GUARD',
      '{"activeProjectId":"P-GUARD"}'::jsonb, v_tasks, '[]'::jsonb, v_actor
    );
    raise exception 'GUARD_STALE_CLIENT_ACCEPTED';
  exception when serialization_failure then
    null;
  end;

  -- Empty and reduced task payloads must be rejected.
  begin
    perform public.persist_vwork_training_operations_state(
      v_state_id, 1, '10000000-0000-4000-8000-000000000003'::uuid, 'GUARD_EMPTY', 'P-GUARD',
      '{"activeProjectId":"P-GUARD"}'::jsonb, '[]'::jsonb, '[]'::jsonb, v_actor
    );
    raise exception 'GUARD_EMPTY_TASKS_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'VWORK_EMPTY_TASK_PAYLOAD_REJECTED' then raise; end if;
  end;

  begin
    perform public.persist_vwork_training_operations_state(
      v_state_id, 1, '10000000-0000-4000-8000-000000000004'::uuid, 'GUARD_MISSING', 'P-GUARD',
      '{"activeProjectId":"P-GUARD"}'::jsonb, jsonb_build_array(v_tasks -> 0), '[]'::jsonb, v_actor
    );
    raise exception 'GUARD_MISSING_TASK_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'VWORK_MISSING_EXISTING_TASK_REJECTED' then raise; end if;
  end;

  -- Explicit cancellation keeps the task row and its recoverable history.
  v_tasks := jsonb_set(v_tasks, '{1,status}', '"CANCELLED"'::jsonb);
  v_result := public.persist_vwork_training_operations_state(
    v_state_id, 1, '10000000-0000-4000-8000-000000000005'::uuid, 'GUARD_CANCEL', 'P-GUARD',
    '{"activeProjectId":"P-GUARD"}'::jsonb, v_tasks,
    '[{"id":"A-GUARD-02","type":"GUARD_CANCEL","summary":"Cancel one task","happenedAt":"2026-08-25T00:01:00Z"}]'::jsonb,
    v_actor
  );
  if (select archived_at is null from public.vwork_training_operations_tasks where state_id = v_state_id and task_id = 'T-GUARD-02') then
    raise exception 'GUARD_CANCEL_DID_NOT_ARCHIVE';
  end if;

  -- Force a late audit failure after task processing; the whole command must roll back.
  select snapshot into v_snapshot from public.vwork_training_operations_tasks where state_id = v_state_id and task_id = 'T-GUARD-01';
  begin
    perform public.persist_vwork_training_operations_state(
      v_state_id, 2, '10000000-0000-4000-8000-000000000006'::uuid, 'GUARD_LATE_FAILURE', 'P-GUARD',
      '{"activeProjectId":"P-GUARD","shouldNotPersist":true}'::jsonb,
      jsonb_set(v_tasks, '{0,status}', '"DONE"'::jsonb),
      '[{"id":"A-GUARD-BROKEN","type":"GUARD_LATE_FAILURE","happenedAt":"2026-08-25T00:02:00Z"}]'::jsonb,
      v_actor
    );
    raise exception 'GUARD_LATE_FAILURE_ACCEPTED';
  exception when not_null_violation then
    null;
  end;
  select version into v_version from public.vwork_training_operations_state where id = v_state_id;
  if v_version <> 2 then raise exception 'GUARD_LATE_FAILURE_CHANGED_VERSION'; end if;
  if (select snapshot from public.vwork_training_operations_tasks where state_id = v_state_id and task_id = 'T-GUARD-01') is distinct from v_snapshot then
    raise exception 'GUARD_LATE_FAILURE_CHANGED_TASK';
  end if;
end;
$$;

rollback;

