-- =====================================================================
-- Monitor de PAs — schema Supabase
-- Execute no SQL Editor do Supabase (uma única vez).
-- =====================================================================

create table if not exists public.workstations (
  id            text primary key,
  code          text not null,
  label         text,
  type          text not null default 'operator' check (type in ('operator','supervisor')),
  block_name    text,
  grid_position text,
  status        text not null default 'active' check (status in ('active','maintenance')),
  updated_at    timestamptz not null default now()
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
  updated_at      timestamptz not null default now()
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
  created_at      timestamptz not null default now()
);

create index if not exists idx_shifts_ws on public.operator_shifts(workstation_id);
create index if not exists idx_alerts_pending on public.alert_logs(acknowledged_at);

-- ---------------------------------------------------------------------
-- Segurança RLS: leitura para Realtime + escrita apenas com cabeçalho autorizado
-- ---------------------------------------------------------------------
create or replace function public.is_pa_authorized()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((current_setting('request.headers', true)::jsonb ->> 'x-pa-client'), '') = 'pa-monitor-adm156';
$$;

alter table public.workstations    enable row level security;
alter table public.operator_shifts enable row level security;
alter table public.alert_logs      enable row level security;

drop policy if exists "pa_all_workstations"    on public.workstations;
drop policy if exists "pa_select_workstations" on public.workstations;
drop policy if exists "pa_insert_workstations" on public.workstations;
drop policy if exists "pa_update_workstations" on public.workstations;
drop policy if exists "pa_delete_workstations" on public.workstations;

create policy "pa_select_workstations" on public.workstations for select using (true);
create policy "pa_insert_workstations" on public.workstations for insert with check (public.is_pa_authorized());
create policy "pa_update_workstations" on public.workstations for update using (public.is_pa_authorized()) with check (public.is_pa_authorized());
create policy "pa_delete_workstations" on public.workstations for delete using (public.is_pa_authorized());

drop policy if exists "pa_all_shifts"    on public.operator_shifts;
drop policy if exists "pa_select_shifts" on public.operator_shifts;
drop policy if exists "pa_insert_shifts" on public.operator_shifts;
drop policy if exists "pa_update_shifts" on public.operator_shifts;
drop policy if exists "pa_delete_shifts" on public.operator_shifts;

create policy "pa_select_shifts" on public.operator_shifts for select using (true);
create policy "pa_insert_shifts" on public.operator_shifts for insert with check (public.is_pa_authorized());
create policy "pa_update_shifts" on public.operator_shifts for update using (public.is_pa_authorized()) with check (public.is_pa_authorized());
create policy "pa_delete_shifts" on public.operator_shifts for delete using (public.is_pa_authorized());

drop policy if exists "pa_all_alerts"    on public.alert_logs;
drop policy if exists "pa_select_alerts" on public.alert_logs;
drop policy if exists "pa_insert_alerts" on public.alert_logs;
drop policy if exists "pa_update_alerts" on public.alert_logs;
drop policy if exists "pa_delete_alerts" on public.alert_logs;

create policy "pa_select_alerts" on public.alert_logs for select using (true);
create policy "pa_insert_alerts" on public.alert_logs for insert with check (public.is_pa_authorized());
create policy "pa_update_alerts" on public.alert_logs for update using (public.is_pa_authorized()) with check (public.is_pa_authorized());
create policy "pa_delete_alerts" on public.alert_logs for delete using (public.is_pa_authorized());

-- ---------------------------------------------------------------------
-- Realtime nas 3 tabelas
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.workstations;
alter publication supabase_realtime add table public.operator_shifts;
alter publication supabase_realtime add table public.alert_logs;
