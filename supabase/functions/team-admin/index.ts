import { withSupabase } from 'npm:@supabase/server@1';

const ROLES = ['admin', 'cashier', 'seller'] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AppRole = (typeof ROLES)[number];

interface ProfileRow {
  readonly id: string;
  readonly boutique_id: string;
  readonly email: string;
  readonly actif: boolean;
  readonly role: AppRole;
  readonly est_superadmin: boolean;
}

interface CreateBody {
  readonly action: 'create';
  readonly email: string;
  readonly nom: string;
  readonly role: AppRole;
}

interface ResetBody {
  readonly action: 'reset_password';
  readonly user_id: string;
}

type ActionBody = CreateBody | ResetBody;

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function failure(status: number, error: string, message: string): Response {
  return json(status, { error, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function parseBody(value: unknown): ActionBody | null {
  if (!isRecord(value) || typeof value['action'] !== 'string') {
    return null;
  }

  if (value['action'] === 'create') {
    const email = typeof value['email'] === 'string' ? value['email'].trim().toLowerCase() : '';
    const nom = typeof value['nom'] === 'string' ? value['nom'].trim() : '';
    const role = value['role'];

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return null;
    }
    if (nom.length < 1 || nom.length > 120 || !isRole(role)) {
      return null;
    }

    return { action: 'create', email, nom, role };
  }

  if (value['action'] === 'reset_password') {
    const userId = typeof value['user_id'] === 'string' ? value['user_id'].trim() : '';
    if (!UUID_PATTERN.test(userId)) {
      return null;
    }
    return { action: 'reset_password', user_id: userId };
  }

  return null;
}

function temporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return failure(405, 'method_not_allowed', 'Méthode non autorisée.');
    }

    const actorId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!actorId) {
      return failure(401, 'unauthenticated', 'Reconnecte-toi pour gérer les comptes.');
    }

    const { data: actorData, error: actorError } = await ctx.supabaseAdmin
      .from('profiles')
      .select('id, boutique_id, email, actif, role, est_superadmin')
      .eq('id', actorId)
      .maybeSingle();
    const actor = actorData as ProfileRow | null;

    if (actorError) {
      console.error('team_admin_actor_failed', actorError.message);
      return failure(500, 'profile_failed', 'Impossible de vérifier ton compte.');
    }

    if (!actor || !actor.actif || actor.role !== 'admin' || !actor.est_superadmin) {
      return failure(
        403,
        'forbidden',
        'Cette action est réservée au compte superadmin de la boutique.',
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return failure(400, 'invalid_json', 'La demande est illisible.');
    }

    const body = parseBody(rawBody);
    if (!body) {
      return failure(400, 'invalid_request', 'Les informations du compte sont incomplètes.');
    }

    if (body.action === 'create') {
      const password = temporaryPassword();
      const { data, error } = await ctx.supabaseAdmin.auth.admin.createUser({
        email: body.email,
        password,
        email_confirm: true,
        user_metadata: { nom: body.nom },
        app_metadata: {
          role: body.role,
          boutique_id: actor.boutique_id,
          actif: true,
        },
      });

      if (error || !data.user) {
        if (
          error?.code === 'email_exists' ||
          /already been registered|already registered|email exists/i.test(error?.message ?? '')
        ) {
          return failure(409, 'email_exists', 'Un compte utilise déjà cette adresse e-mail.');
        }

        console.error('team_admin_create_failed', error?.message ?? 'empty_response');
        return failure(500, 'create_failed', 'Le compte n’a pas pu être créé.');
      }

      const { error: auditError } = await ctx.supabaseAdmin.from('audit_log').insert({
        boutique_id: actor.boutique_id,
        user_id: actor.id,
        action: 'profile_created',
        entity: 'profiles',
        entity_id: data.user.id,
        details: { email: body.email, nom: body.nom, role: body.role },
      });
      if (auditError) {
        console.error('team_admin_audit_failed', auditError.message);
      }

      return json(201, {
        id: data.user.id,
        email: body.email,
        password,
      });
    }

    const { data: targetData, error: targetError } = await ctx.supabaseAdmin
      .from('profiles')
      .select('id, boutique_id, email, actif, role, est_superadmin')
      .eq('id', body.user_id)
      .eq('boutique_id', actor.boutique_id)
      .maybeSingle();
    const target = targetData as ProfileRow | null;

    if (targetError) {
      console.error('team_admin_target_failed', targetError.message);
      return failure(500, 'profile_failed', 'Impossible de vérifier ce compte.');
    }

    if (!target) {
      return failure(404, 'not_found', 'Compte introuvable dans cette boutique.');
    }

    const password = temporaryPassword();
    const { error: updateError } = await ctx.supabaseAdmin.auth.admin.updateUserById(
      target.id,
      { password },
    );

    if (updateError) {
      console.error('team_admin_reset_failed', updateError.message);
      return failure(500, 'reset_failed', 'Le mot de passe n’a pas pu être réinitialisé.');
    }

    const { error: auditError } = await ctx.supabaseAdmin.from('audit_log').insert({
      boutique_id: actor.boutique_id,
      user_id: actor.id,
      action: 'password_reset',
      entity: 'profiles',
      entity_id: target.id,
      details: { email: target.email },
    });
    if (auditError) {
      console.error('team_admin_audit_failed', auditError.message);
    }

    return json(200, {
      id: target.id,
      email: target.email,
      password,
    });
  }),
};
