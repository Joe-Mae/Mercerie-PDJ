import type { AppRole } from '../types';
import { getSupabase } from '../lib/supabase';

export interface TeamMember {
  readonly id: string;
  readonly email: string;
  readonly nom: string;
  readonly role: AppRole;
  readonly actif: boolean;
  readonly estSuperadmin: boolean;
  readonly dernierAccesAt: string | null;
}

export interface TeamCredentials {
  readonly memberId: string;
  readonly email: string;
  readonly password: string;
}

interface TeamRow {
  readonly id: string;
  readonly email: string;
  readonly nom: string;
  readonly role: AppRole;
  readonly actif: boolean;
  readonly est_superadmin: boolean;
  readonly dernier_acces_at: string | null;
}

interface RpcErrorLike {
  readonly message: string;
  readonly code?: string;
}

interface CredentialsPayload {
  readonly id: string;
  readonly email: string;
  readonly password: string;
}

const DEMO_TEAM_KEY = 'mercerie.demo.team.v1';

const DEMO_TEAM: readonly TeamMember[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'superadmin@merceriepdj.test',
    nom: 'Mme Adjovi',
    role: 'admin',
    actif: true,
    estSuperadmin: true,
    dernierAccesAt: '2026-11-09T07:40:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000006',
    email: 'proprietaire@merceriepdj.test',
    nom: 'Koffi',
    role: 'admin',
    actif: true,
    estSuperadmin: false,
    dernierAccesAt: '2026-11-08T17:12:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    email: 'caisse@merceriepdj.test',
    nom: 'Awa',
    role: 'cashier',
    actif: true,
    estSuperadmin: false,
    dernierAccesAt: '2026-11-09T08:05:00.000Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    email: 'vente@merceriepdj.test',
    nom: 'Kossi',
    role: 'seller',
    actif: true,
    estSuperadmin: false,
    dernierAccesAt: null,
  },
];

function isMember(value: unknown): value is TeamMember {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<TeamMember>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.nom === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.actif === 'boolean' &&
    typeof candidate.estSuperadmin === 'boolean' &&
    (candidate.dernierAccesAt === null || typeof candidate.dernierAccesAt === 'string')
  );
}

function readDemoTeam(): TeamMember[] {
  try {
    const raw = localStorage.getItem(DEMO_TEAM_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every(isMember)) {
        return parsed;
      }
    }
  } catch {
    // L’aperçu retombe sur les comptes de démonstration d’origine.
  }

  return DEMO_TEAM.map((member) => ({ ...member }));
}

function writeDemoTeam(members: readonly TeamMember[]): void {
  try {
    localStorage.setItem(DEMO_TEAM_KEY, JSON.stringify(members));
  } catch {
    // L’aperçu reste utilisable même sans stockage local.
  }
}

function demoPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const code = Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12);
  return `PdJ-${code}`;
}

function rpcError(error: RpcErrorLike, fallback: string): string {
  if (error.code === '42501' || /superadmin/i.test(error.message)) {
    return 'Cette action est réservée au compte superadmin.';
  }
  if (error.code === 'P0002' || /introuvable/i.test(error.message)) {
    return 'Compte introuvable dans cette boutique.';
  }
  if (error.code === '23514' || /dernier administrateur/i.test(error.message)) {
    return 'Impossible de désactiver le dernier administrateur actif.';
  }
  return fallback;
}

async function functionMessage(error: unknown, fallback: string): Promise<string> {
  if (typeof error === 'object' && error !== null && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body: unknown = await context.json();
        if (typeof body === 'object' && body !== null && 'message' in body) {
          const message = (body as { message?: unknown }).message;
          if (typeof message === 'string' && message.length > 0) {
            return message;
          }
        }
      } catch {
        // Le message générique suffit si la réponse n’est pas du JSON.
      }
    }
  }

  if (error instanceof Error && /failed to send|fetch|network|cors/i.test(error.message)) {
    return 'Connexion au serveur impossible. Vérifie le réseau puis réessaie.';
  }

  return fallback;
}

async function invokeTeamAdmin(
  body: Record<string, unknown>,
  fallback: string,
): Promise<CredentialsPayload> {
  const { data, error } = await getSupabase().functions.invoke('team-admin', { body });

  if (error) {
    throw new Error(await functionMessage(error, fallback));
  }

  const payload = data as Partial<CredentialsPayload> | null;
  if (
    !payload ||
    typeof payload.id !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.password !== 'string'
  ) {
    throw new Error(fallback);
  }

  return { id: payload.id, email: payload.email, password: payload.password };
}

export async function loadTeam(demo: boolean): Promise<TeamMember[]> {
  if (demo) {
    return readDemoTeam();
  }

  const { data, error } = await getSupabase().rpc('team_list');

  if (error) {
    throw new Error(
      rpcError(
        error,
        'Impossible de charger l’équipe. Vérifie la connexion puis réessaie.',
      ),
    );
  }

  return ((data ?? []) as TeamRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    nom: row.nom,
    role: row.role,
    actif: row.actif,
    estSuperadmin: row.est_superadmin,
    dernierAccesAt: row.dernier_acces_at,
  }));
}

export async function changeTeamRole(
  demo: boolean,
  memberId: string,
  role: AppRole,
): Promise<void> {
  if (demo) {
    const members = readDemoTeam();
    const target = members.find((member) => member.id === memberId);
    if (!target) {
      throw new Error('Compte introuvable dans cette boutique.');
    }
    if (target.estSuperadmin) {
      throw new Error('Le compte superadmin ne peut pas changer de rôle.');
    }
    writeDemoTeam(
      members.map((member) => (member.id === memberId ? { ...member, role } : member)),
    );
    return;
  }

  const { error } = await getSupabase().rpc('team_set_role', {
    p_user_id: memberId,
    p_role: role,
  });

  if (error) {
    throw new Error(rpcError(error, 'Le rôle n’a pas pu être modifié. Réessaie.'));
  }
}

export async function changeTeamActivation(
  demo: boolean,
  memberId: string,
  actif: boolean,
): Promise<void> {
  if (demo) {
    const members = readDemoTeam();
    const target = members.find((member) => member.id === memberId);
    if (!target) {
      throw new Error('Compte introuvable dans cette boutique.');
    }
    if (target.estSuperadmin) {
      throw new Error('Le compte superadmin ne peut pas être désactivé.');
    }
    writeDemoTeam(
      members.map((member) => (member.id === memberId ? { ...member, actif } : member)),
    );
    return;
  }

  const { error } = await getSupabase().rpc('team_set_actif', {
    p_user_id: memberId,
    p_actif: actif,
  });

  if (error) {
    throw new Error(rpcError(error, 'L’état du compte n’a pas pu être modifié. Réessaie.'));
  }
}

export async function createTeamMember(
  demo: boolean,
  input: { readonly nom: string; readonly email: string; readonly role: AppRole },
): Promise<TeamCredentials> {
  if (demo) {
    const members = readDemoTeam();
    const email = input.email.trim().toLowerCase();

    if (members.some((member) => member.email.toLowerCase() === email)) {
      throw new Error('Un compte utilise déjà cette adresse e-mail.');
    }

    const member: TeamMember = {
      id: `demo-${crypto.randomUUID()}`,
      email,
      nom: input.nom.trim(),
      role: input.role,
      actif: true,
      estSuperadmin: false,
      dernierAccesAt: null,
    };
    writeDemoTeam([...members, member]);

    return { memberId: member.id, email: member.email, password: demoPassword() };
  }

  const payload = await invokeTeamAdmin(
    {
      action: 'create',
      email: input.email.trim().toLowerCase(),
      nom: input.nom.trim(),
      role: input.role,
    },
    'Le compte n’a pas pu être créé. Réessaie.',
  );

  return { memberId: payload.id, email: payload.email, password: payload.password };
}

export async function resetTeamPassword(
  demo: boolean,
  memberId: string,
): Promise<TeamCredentials> {
  if (demo) {
    const member = readDemoTeam().find((entry) => entry.id === memberId);
    if (!member) {
      throw new Error('Compte introuvable dans cette boutique.');
    }
    return { memberId: member.id, email: member.email, password: demoPassword() };
  }

  const payload = await invokeTeamAdmin(
    { action: 'reset_password', user_id: memberId },
    'Le mot de passe n’a pas pu être réinitialisé. Réessaie.',
  );

  return { memberId: payload.id, email: payload.email, password: payload.password };
}
