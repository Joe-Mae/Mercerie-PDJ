-- Webhook Database vers la fonction Edge send-push.
-- La clé secrète est lue dans Supabase Vault (send_push_apikey) : elle n'existe pas ici.
-- Sans pg_net (tests PGlite), aucun déclencheur n'est créé.

do $guard$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return;
  end if;

  execute 'create extension if not exists pg_net with schema extensions';
  execute 'create schema if not exists private';
  execute 'revoke all on schema private from public';
  execute 'grant usage on schema private to postgres, service_role';

  execute $migration$
    create or replace function private.notify_alert_push()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $body$
    declare
      api_key text;
    begin
      select decrypted_secret into api_key
      from vault.decrypted_secrets
      where name = 'send_push_apikey'
      limit 1;

      if api_key is null then
        raise warning 'send_push_apikey absent de Vault';
        return new;
      end if;

      perform net.http_post(
        url := 'https://uwruoxubqsyfhyxnmvdd.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', api_key
        ),
        body := jsonb_build_object(
          'type', 'INSERT',
          'table', 'alerts',
          'schema', 'public',
          'record', to_jsonb(new),
          'old_record', null
        ),
        timeout_milliseconds := 5000
      );

      return new;
    end;
    $body$;
  $migration$;

  execute 'revoke all on function private.notify_alert_push() from public';
  execute 'drop trigger if exists alerts_push_webhook on public.alerts';
  execute 'create trigger alerts_push_webhook after insert on public.alerts for each row execute function private.notify_alert_push()';
end
$guard$;
