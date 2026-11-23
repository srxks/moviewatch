SELECT cron.schedule(
  'moviewatch-monitor-cron',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://jzrgfywbwjkazmujiccp.supabase.co/functions/v1/monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_4LW3Su4Fp26SxGrMHcQ5rQ_OiP_QYNq'
      ),
      body := jsonb_build_object('triggered_by', 'pg_cron')
    ) AS request_id;
  $$
);
