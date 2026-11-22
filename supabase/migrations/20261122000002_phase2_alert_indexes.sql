-- =====================================================================
-- Fase 2 — Índices otimizados para consulta recente e alertas pendentes
-- =====================================================================

create index if not exists idx_alerts_unacked
  on public.alert_logs (created_at desc)
  where acknowledged_at is null;

create index if not exists idx_alerts_created_desc
  on public.alert_logs (created_at desc);
