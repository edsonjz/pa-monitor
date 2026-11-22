-- =====================================================================
-- Monitor de PAs — schema Supabase (Fase 1 Hardened)
-- Para instalações novas: execute no SQL Editor do Supabase (uma única vez).
-- Para bancos já existentes: execute supabase/migrations/20261122000001_phase1_security_rls.sql.
-- =====================================================================

create table if not exists public.workstations (
  id            text primary key,
  code          text not null,
  label         text,
  type          text not null default 'operator' check (type in ('operator','supervisor')),
  block_name    text,
  grid_position text,
  status        text not null default 'active' check (status in ('active','maintenance')),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

create table if not exists public.operator_shifts (
  id              text primary key,
  workstation_id  text not null references public.workstations(id) on delete cascade on update cascade,
  operator_name   text,
  team            text,
  shift_label     text,
  login_time      text,
  break10_1_time  text,
  break60_time    text,
  break10_2_time  text,
  logout_time     text,
  notes           text,
  current_state   text not null default 'pending' check (current_state in ('pending','logged','break','done','falta','atestado','dsr','ferias','no_internet','no_power','tech_issue')),
  break_kind      text,
  state_date      text,
  incident_time   text not null default '',
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

create table if not exists public.alert_logs (
  id              text primary key,  -- chave determinística: data|turno|evento|hora
  workstation_id  text,
  shift_id        text,
  ws_code         text,
  operator_name   text,
  event_type      text not null,
  scheduled_time  text,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  acknowledged_by uuid references auth.users(id) on delete set null
);

alter table public.workstations
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.operator_shifts
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.alert_logs
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists acknowledged_by uuid references auth.users(id) on delete set null;

create index if not exists idx_shifts_ws on public.operator_shifts(workstation_id);
create index if not exists idx_alerts_pending on public.alert_logs(acknowledged_at);

-- ---------------------------------------------------------------------
-- Auditoria automática no servidor (SECURITY INVOKER)
-- ---------------------------------------------------------------------
create or replace function public.pa_set_updated_audit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.pa_set_alert_audit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.acknowledged_at is not null then
      new.acknowledged_by := coalesce(auth.uid(), new.acknowledged_by);
    else
      new.acknowledged_by := null;
    end if;
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    if old.acknowledged_at is null and new.acknowledged_at is not null then
      new.acknowledged_by := coalesce(auth.uid(), new.acknowledged_by);
    else
      new.acknowledged_by := old.acknowledged_by;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.pa_set_updated_audit() from public, anon;
grant execute on function public.pa_set_updated_audit() to authenticated;

revoke execute on function public.pa_set_alert_audit() from public, anon;
grant execute on function public.pa_set_alert_audit() to authenticated;

drop trigger if exists trg_workstations_audit on public.workstations;
create trigger trg_workstations_audit
  before insert or update on public.workstations
  for each row execute function public.pa_set_updated_audit();

drop trigger if exists trg_operator_shifts_audit on public.operator_shifts;
create trigger trg_operator_shifts_audit
  before insert or update on public.operator_shifts
  for each row execute function public.pa_set_updated_audit();

drop trigger if exists trg_alert_logs_audit on public.alert_logs;
create trigger trg_alert_logs_audit
  before insert or update on public.alert_logs
  for each row execute function public.pa_set_alert_audit();

-- ---------------------------------------------------------------------
-- Segurança RLS: acesso restrito a usuários autenticados (Supabase Auth)
-- ---------------------------------------------------------------------
drop policy if exists "pa_all_workstations"    on public.workstations;
drop policy if exists "pa_select_workstations" on public.workstations;
drop policy if exists "pa_insert_workstations" on public.workstations;
drop policy if exists "pa_update_workstations" on public.workstations;
drop policy if exists "pa_delete_workstations" on public.workstations;
drop policy if exists "auth_select_workstations" on public.workstations;
drop policy if exists "auth_insert_workstations" on public.workstations;
drop policy if exists "auth_update_workstations" on public.workstations;

drop policy if exists "pa_all_shifts"    on public.operator_shifts;
drop policy if exists "pa_select_shifts" on public.operator_shifts;
drop policy if exists "pa_insert_shifts" on public.operator_shifts;
drop policy if exists "pa_update_shifts" on public.operator_shifts;
drop policy if exists "pa_delete_shifts" on public.operator_shifts;
drop policy if exists "auth_select_shifts" on public.operator_shifts;
drop policy if exists "auth_insert_shifts" on public.operator_shifts;
drop policy if exists "auth_update_shifts" on public.operator_shifts;
drop policy if exists "auth_delete_shifts" on public.operator_shifts;

drop policy if exists "pa_all_alerts"    on public.alert_logs;
drop policy if exists "pa_select_alerts" on public.alert_logs;
drop policy if exists "pa_insert_alerts" on public.alert_logs;
drop policy if exists "pa_update_alerts" on public.alert_logs;
drop policy if exists "pa_delete_alerts" on public.alert_logs;
drop policy if exists "auth_select_alerts" on public.alert_logs;
drop policy if exists "auth_insert_alerts" on public.alert_logs;
drop policy if exists "auth_update_alerts" on public.alert_logs;
drop policy if exists "auth_delete_alerts" on public.alert_logs;

drop function if exists public.is_pa_authorized();

revoke all on table public.workstations    from public, anon;
revoke all on table public.operator_shifts from public, anon;
revoke all on table public.alert_logs      from public, anon;

grant select, insert, update         on table public.workstations    to authenticated;
grant select, insert, update, delete on table public.operator_shifts to authenticated;
grant select, insert, update, delete on table public.alert_logs      to authenticated;

alter table public.workstations    enable row level security;
alter table public.operator_shifts enable row level security;
alter table public.alert_logs      enable row level security;

create policy "auth_select_workstations"
  on public.workstations for select
  to authenticated
  using ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_insert_workstations"
  on public.workstations for insert
  to authenticated
  with check ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_update_workstations"
  on public.workstations for update
  to authenticated
  using ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_select_shifts"
  on public.operator_shifts for select
  to authenticated
  using ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_insert_shifts"
  on public.operator_shifts for insert
  to authenticated
  with check ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_update_shifts"
  on public.operator_shifts for update
  to authenticated
  using ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_delete_shifts"
  on public.operator_shifts for delete
  to authenticated
  using ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_select_alerts"
  on public.alert_logs for select
  to authenticated
  using ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_insert_alerts"
  on public.alert_logs for insert
  to authenticated
  with check ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_update_alerts"
  on public.alert_logs for update
  to authenticated
  using ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy "auth_delete_alerts"
  on public.alert_logs for delete
  to authenticated
  using ((select auth.uid()) is not null and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

-- ---------------------------------------------------------------------
-- Realtime nas 3 tabelas (idempotente)
-- ---------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array['workstations', 'operator_shifts', 'alert_logs'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end
$$;
