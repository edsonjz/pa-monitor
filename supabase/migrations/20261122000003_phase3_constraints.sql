-- =====================================================================
-- Fase 3 — Constraints de integridade e índices de apoio
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_shifts_break_kind'
      and conrelid = 'public.operator_shifts'::regclass
  ) then
    alter table public.operator_shifts
      add constraint chk_shifts_break_kind
      check (break_kind is null or break_kind in ('', 'b1', 'b60', 'b2')) not valid;
    alter table public.operator_shifts
      validate constraint chk_shifts_break_kind;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_alerts_event_type'
      and conrelid = 'public.alert_logs'::regclass
  ) then
    alter table public.alert_logs
      add constraint chk_alerts_event_type
      check (event_type in (
        'login','b1s','b1r','b60s','b60r','b2s','b2r','logout',
        'no_internet','no_power','tech_issue','incident_resolved'
      )) not valid;
    alter table public.alert_logs
      validate constraint chk_alerts_event_type;
  end if;
end
$$;

create index if not exists idx_alerts_shift_id on public.alert_logs(shift_id);
create index if not exists idx_alerts_ws_id on public.alert_logs(workstation_id);
