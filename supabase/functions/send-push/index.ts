import { withSupabase } from 'npm:@supabase/server@1';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import {
  alertPushPayload,
  parseAlertInsert,
  recipientRoles,
  type AlertRecord,
} from '../_shared/push.ts';

interface SubscriptionRow {
  readonly id: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function pushContact(): string {
  const value = (Deno.env.get('PUSH_CONTACT') ?? '').trim();
  if (!value) {
    throw new Error('PUSH_CONTACT est absent des secrets Supabase.');
  }
  return value.includes(':') ? value : `mailto:${value}`;
}

async function applicationServer(): Promise<webpush.ApplicationServer> {
  const raw = Deno.env.get('VAPID_KEYS');
  if (!raw) {
    throw new Error('VAPID_KEYS est absent des secrets Supabase.');
  }

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(raw));
  return webpush.ApplicationServer.new({
    contactInformation: pushContact(),
    vapidKeys,
  });
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return json(405, { error: 'method_not_allowed' });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_json' });
    }

    const alert: AlertRecord | null = parseAlertInsert(body);
    if (!alert) {
      return json(400, { error: 'not_an_alert_insert' });
    }

    const roles = recipientRoles(alert.type);
    const { data: profiles, error: profileError } = await ctx.supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('boutique_id', alert.boutique_id)
      .eq('actif', true)
      .in('role', roles);

    if (profileError) {
      console.error('push_recipients_failed', profileError.message);
      return json(500, { error: 'recipients_failed' });
    }

    const userIds = (profiles ?? [])
      .map((profile) => profile.id)
      .filter((id): id is string => typeof id === 'string');

    if (userIds.length === 0) {
      return json(200, { sent: 0, revoked: 0, failed: 0 });
    }

    const { data: subscriptions, error: subscriptionError } = await ctx.supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('boutique_id', alert.boutique_id)
      .in('user_id', userIds)
      .is('revoked_at', null);

    if (subscriptionError) {
      console.error('push_subscriptions_failed', subscriptionError.message);
      return json(500, { error: 'subscriptions_failed' });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return json(200, { sent: 0, revoked: 0, failed: 0 });
    }

    let server: webpush.ApplicationServer;
    try {
      server = await applicationServer();
    } catch (cause) {
      console.error('push_configuration_failed', cause instanceof Error ? cause.message : cause);
      return json(500, { error: 'push_not_configured' });
    }

    const payload = alertPushPayload(alert);
    const message = JSON.stringify(payload);
    let sent = 0;
    let revoked = 0;
    let failed = 0;

    for (const subscription of subscriptions as SubscriptionRow[]) {
      try {
        const subscriber = server.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        });
        await subscriber.pushTextMessage(message, {
          ttl: 3600,
          urgency: webpush.Urgency.High,
        });
        sent += 1;
      } catch (cause) {
        if (
          cause instanceof webpush.PushMessageError &&
          (cause.isGone() || cause.response.status === 404)
        ) {
          const { error } = await ctx.supabaseAdmin
            .from('push_subscriptions')
            .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', subscription.id)
            .eq('boutique_id', alert.boutique_id);

          if (!error) {
            revoked += 1;
            continue;
          }
        }

        failed += 1;
        console.error(
          'push_failed',
          subscription.id,
          cause instanceof Error ? cause.message : cause,
        );
      }
    }

    return json(200, { sent, revoked, failed });
  }),
};
