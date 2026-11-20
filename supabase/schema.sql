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
  current_state   text not null default 'pending',
  break_kind      text,
  state_date      text,
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
-- RLS: leitura e escrita liberadas para a chave anon (uso interno).
-- Para produção, troque por políticas baseadas em auth (authenticated).
-- ---------------------------------------------------------------------
alter table public.workstations    enable row level security;
alter table public.operator_shifts enable row level security;
alter table public.alert_logs      enable row level security;

drop policy if exists "pa_all_workstations" on public.workstations;
drop policy if exists "pa_all_shifts"       on public.operator_shifts;
drop policy if exists "pa_all_alerts"       on public.alert_logs;

create policy "pa_all_workstations" on public.workstations    for all using (true) with check (true);
create policy "pa_all_shifts"       on public.operator_shifts for all using (true) with check (true);
create policy "pa_all_alerts"       on public.alert_logs      for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- Realtime nas 3 tabelas
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.workstations;
alter publication supabase_realtime add table public.operator_shifts;
alter publication supabase_realtime add table public.alert_logs;
