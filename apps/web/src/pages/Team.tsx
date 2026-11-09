import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserRound,
  UserX,
} from 'lucide-react';
import type { AppRole, ProfileSnapshot } from '../types';
import { ROLE_LABELS } from '../types';
import {
  changeTeamActivation,
  changeTeamRole,
  createTeamMember,
  loadTeam,
  resetTeamPassword,
  type TeamCredentials,
  type TeamMember,
} from '../data/team';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';

const ROLES: readonly AppRole[] = ['admin', 'cashier', 'seller'];

const LAST_ACCESS = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

interface TeamProps {
  readonly profile: ProfileSnapshot;
  readonly demo: boolean;
}

interface CredentialsState extends TeamCredentials {
  readonly mode: 'create' | 'reset';
  readonly nom: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function lastAccess(value: string | null): string {
  if (!value) {
    return 'Jamais connecté';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date de connexion inconnue';
  }

  return `Dernière connexion : ${LAST_ACCESS.format(date)}`;
}

export function Team({ profile, demo }: TeamProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<CredentialsState | null>(null);

  const readMembers = useCallback(async () => {
    const next = await loadTeam(demo);
    setMembers(next);
    return next;
  }, [demo]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const next = await loadTeam(demo);
        if (active) {
          setMembers(next);
          setError(null);
        }
      } catch (cause) {
        if (active) {
          setError(messageOf(cause, 'Impossible de charger l’équipe.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [demo]);

  const run = async (memberId: string, action: () => Promise<void>, success: string) => {
    setBusyId(memberId);
    setError(null);
    setNotice(null);

    try {
      await action();
      await readMembers();
      setNotice(success);
    } catch (cause) {
      setError(messageOf(cause, 'La modification n’a pas pu être enregistrée.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRole = (member: TeamMember, role: AppRole) => {
    if (role === member.role) {
      return;
    }

    void run(
      member.id,
      () => changeTeamRole(demo, member.id, role),
      `Le rôle de ${member.nom} est maintenant « ${ROLE_LABELS[role]} ».`,
    );
  };

  const handleActivation = (member: TeamMember) => {
    if (member.actif) {
      const confirmed = window.confirm(
        `Désactiver le compte de ${member.nom} ? La personne ne pourra plus se connecter. Son historique reste intact et le compte peut être réactivé.`,
      );
      if (!confirmed) {
        return;
      }
    }

    void run(
      member.id,
      () => changeTeamActivation(demo, member.id, !member.actif),
      member.actif ? `Le compte de ${member.nom} est désactivé.` : `Le compte de ${member.nom} est réactivé.`,
    );
  };

  const handleReset = (member: TeamMember) => {
    const confirmed = window.confirm(
      `Réinitialiser le mot de passe de ${member.nom} ? L’ancien mot de passe ne fonctionnera plus.`,
    );
    if (!confirmed) {
      return;
    }

    void (async () => {
      setBusyId(member.id);
      setError(null);
      setNotice(null);

      try {
        const result = await resetTeamPassword(demo, member.id);
        setCredentials({ ...result, mode: 'reset', nom: member.nom });
      } catch (cause) {
        setError(messageOf(cause, 'Le mot de passe n’a pas pu être réinitialisé.'));
      } finally {
        setBusyId(null);
      }
    })();
  };

  const handleCreate = async (input: {
    readonly nom: string;
    readonly email: string;
    readonly role: AppRole;
  }) => {
    const result = await createTeamMember(demo, input);
    await readMembers();
    setCreateOpen(false);
    setCredentials({ ...result, mode: 'create', nom: input.nom.trim() });
    setNotice('Le compte est créé. Transmets le mot de passe temporaire à la personne.');
    setError(null);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Équipe et droits · Superadmin"
        title="Chacun son compte, chacun son rôle"
        description="Crée les accès, ajuste les rôles et réinitialise les mots de passe. Chaque changement est vérifié côté serveur et laissé au journal d’audit."
      />

      <section className="panel team-panel">
        <header className="panel-header">
          <div>
            <h2>Comptes de la boutique</h2>
            <p>
              {loading
                ? 'Chargement des comptes…'
                : `${members.length} compte${members.length > 1 ? 's' : ''} · aucun compte n’est jamais supprimé`}
            </p>
          </div>
          <button
            type="button"
            className="button button-gold"
            onClick={() => {
              setNotice(null);
              setError(null);
              setCreateOpen(true);
            }}
          >
            <UserPlus size={18} aria-hidden="true" />
            Créer un compte
          </button>
        </header>

        {error && (
          <p className="form-error team-message" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-notice team-message" role="status">
            {notice}
          </p>
        )}

        {loading ? (
          <p className="prose">Chargement de l’équipe…</p>
        ) : members.length === 0 ? (
          <p className="prose">Aucun compte n’est encore enregistré dans cette boutique.</p>
        ) : (
          <ul className="team-list">
            {members.map((member) => {
              const busy = busyId === member.id;
              const isSelf = member.id === profile.id;

              return (
                <li
                  key={member.id}
                  className={`team-row${member.actif ? '' : ' is-inactive'}`}
                >
                  <span className="avatar team-avatar" aria-hidden="true">
                    {initials(member.nom)}
                  </span>

                  <div className="team-identity">
                    <strong>
                      {member.nom}
                      {isSelf && <span className="team-self">Toi</span>}
                      {member.estSuperadmin && (
                        <span className="team-superadmin-tag" title="Compte protégé">
                          <ShieldCheck size={13} aria-hidden="true" />
                          Superadmin
                        </span>
                      )}
                    </strong>
                    <span>{member.email}</span>
                    <small>{lastAccess(member.dernierAccesAt)}</small>
                  </div>

                  <div className="team-state">
                    <span className={`role-pill role-${member.role}`}>
                      {ROLE_LABELS[member.role]}
                    </span>
                    <span className={`status-pill${member.actif ? ' is-active' : ' is-off'}`}>
                      {member.actif ? 'Actif' : 'Désactivé'}
                    </span>
                  </div>

                  <div className="team-actions">
                    {member.estSuperadmin ? (
                      <span className="team-locked">Compte protégé</span>
                    ) : (
                      <>
                        <label className="team-role-field">
                          <span className="visually-hidden">Rôle de {member.nom}</span>
                          <select
                            value={member.role}
                            onChange={(event) => handleRole(member, event.target.value as AppRole)}
                            disabled={busy}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="button"
                          className="button button-ghost team-action"
                          onClick={() => handleReset(member)}
                          disabled={busy}
                        >
                          <KeyRound size={16} aria-hidden="true" />
                          Mot de passe
                        </button>

                        <button
                          type="button"
                          className={`button team-action ${
                            member.actif ? 'button-ghost' : 'button-gold'
                          }`}
                          onClick={() => handleActivation(member)}
                          disabled={busy}
                        >
                          {member.actif ? (
                            <UserX size={16} aria-hidden="true" />
                          ) : (
                            <UserCheck size={16} aria-hidden="true" />
                          )}
                          {busy ? 'Enregistrement…' : member.actif ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel team-note">
        <h2>
          <UserRound size={18} aria-hidden="true" />
          Ce que cette page garantit
        </h2>
        <ul>
          <li>Aucun compte n’est supprimé : une personne qui quitte la boutique est désactivée.</li>
          <li>
            Le compte superadmin ne peut être ni rétrogradé ni désactivé depuis cette page, et il
            reste le seul à pouvoir gérer l’équipe.
          </li>
          <li>
            Chaque création, changement de rôle, activation ou réinitialisation de mot de passe est
            inscrit dans le journal d’audit.
          </li>
        </ul>
      </section>

      {createOpen && (
        <CreateMemberModal onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      )}

      {credentials && (
        <CredentialsModal state={credentials} onClose={() => setCredentials(null)} />
      )}
    </div>
  );
}

interface CreateMemberModalProps {
  readonly onClose: () => void;
  readonly onCreate: (input: {
    readonly nom: string;
    readonly email: string;
    readonly role: AppRole;
  }) => Promise<void>;
}

function CreateMemberModal({ onClose, onCreate }: CreateMemberModalProps) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('seller');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await onCreate({ nom, email, role });
    } catch (cause) {
      setError(messageOf(cause, 'Le compte n’a pas pu être créé. Réessaie.'));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Créer un compte"
      subtitle="La personne se connectera avec cette adresse et un mot de passe temporaire."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="submit"
            form="team-create-form"
            className="button button-gold"
            disabled={busy}
          >
            {busy ? 'Création…' : 'Créer le compte'}
          </button>
        </>
      }
    >
      <form id="team-create-form" className="team-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          Nom affiché
          <input
            type="text"
            value={nom}
            onChange={(event) => setNom(event.target.value)}
            required
            maxLength={120}
            autoComplete="off"
            placeholder="Ex. : Awa Kossi"
          />
        </label>

        <label className="field">
          Adresse e-mail
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            autoComplete="off"
            placeholder="personne@exemple.com"
          />
          <small>Cette adresse sert d’identifiant de connexion.</small>
        </label>

        <label className="field">
          Rôle
          <select value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {ROLE_LABELS[item]}
              </option>
            ))}
          </select>
          <small>
            L’administrateur voit tout, le caissier encaisse, le vendeur prépare les ventes.
          </small>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <p className="form-hint">
          Un mot de passe temporaire sera généré et affiché une seule fois. La personne choisira
          ensuite son code à 4 chiffres sur son appareil.
        </p>
      </form>
    </Modal>
  );
}

function CredentialsModal({
  state,
  onClose,
}: {
  readonly state: CredentialsState;
  readonly onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Adresse e-mail : ${state.email}\nMot de passe : ${state.password}`,
      );
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  return (
    <Modal
      title={state.mode === 'create' ? 'Compte créé' : 'Mot de passe réinitialisé'}
      subtitle={`${state.nom} · ${state.email}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={() => void copy()}>
            {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
            {copied ? 'Copié' : 'Copier'}
          </button>
          <button type="button" className="button button-gold" onClick={onClose}>
            J’ai noté
          </button>
        </>
      }
    >
      <div className="team-credentials">
        <span>Adresse e-mail</span>
        <code>{state.email}</code>
        <span>Mot de passe temporaire</span>
        <code className="team-password">{state.password}</code>
      </div>

      {copyError && (
        <p className="form-error" role="alert">
          La copie automatique est indisponible. Note le mot de passe avant de fermer cette fenêtre.
        </p>
      )}

      <p className="form-hint">
        Ce mot de passe ne sera plus affiché. Transmets-le à la personne par un moyen sûr. Si tu le
        perds, tu pourras le réinitialiser depuis cette page.
      </p>
    </Modal>
  );
}
