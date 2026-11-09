import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  Bell,
  Boxes,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  ReceiptText,
  TrendingUp,
  WifiOff,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { ROLE_LABELS, type AppRole } from '../types';

interface AuthLayoutProps {
  readonly children: ReactNode;
  readonly caption: string;
}

function AuthLayout({ children, caption }: AuthLayoutProps) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-top">
          <img className="auth-logo" src="/brand/logo-pdj.jpeg" alt="Logo Mercerie PDJ" />
          <p className="eyebrow">Puits de Jacob · Lomé</p>
          <h1>Votre mercerie, enfin simple à gérer.</h1>
          <p className="auth-tagline">
            Le stock, la caisse et les alertes réunis dans une seule application, pensée pour la
            tablette et le téléphone.
          </p>
        </div>

        <ul className="auth-features">
          <li>
            <Boxes size={18} aria-hidden="true" />
            <span>
              <strong>Stock en temps réel</strong> — fils, boutons, tissus et fournitures, au mètre,
              à l’unité ou au poids.
            </span>
          </li>
          <li>
            <Bell size={18} aria-hidden="true" />
            <span>
              <strong>Alertes de réapprovisionnement</strong> — plus de rupture sur vos références
              phares.
            </span>
          </li>
          <li>
            <ReceiptText size={18} aria-hidden="true" />
            <span>
              <strong>Ventes et facturation simplifiées</strong> — encaissez et éditez vos factures
              en quelques clics.
            </span>
          </li>
          <li>
            <TrendingUp size={18} aria-hidden="true" />
            <span>
              <strong>Tableaux de bord clairs</strong> — vos meilleures ventes et vos marges d’un
              coup d’œil.
            </span>
          </li>
        </ul>

        <p className="auth-brand-footer">Mercerie PDJ · Gestion de la boutique</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <p className="auth-caption">{caption}</p>
          {children}
        </div>
        <p className="auth-legal">
          Accès réservé à l’équipe de la boutique. Les droits sont vérifiés sur le serveur.
        </p>
      </main>
    </div>
  );
}

export function SetupRequiredScreen({
  onPreview,
}: {
  readonly onPreview: (role: AppRole) => void;
}) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <AuthLayout caption="Installation">
      <h2 className="auth-title">Relie l’application à ta boutique</h2>
      <p className="auth-text">
        La connexion au serveur n’est pas encore configurée sur cet appareil. L’application
        fonctionne en aperçu, avec des données de démonstration, en attendant les clés Supabase.
      </p>

      <div className="auth-callout">
        <WifiOff size={20} aria-hidden="true" />
        <div>
          <strong>Aucun secret dans le code</strong>
          <p>
            Les clés se placent dans un fichier local <code>.env.local</code>, jamais dans le dépôt.
          </p>
        </div>
      </div>

      <div className="preview-roles">
        <p>Ouvrir l’aperçu avec le rôle :</p>
        <div className="preview-buttons">
          {(['admin', 'cashier', 'seller'] as const).map((role) => (
            <button
              key={role}
              type="button"
              className="button button-ghost"
              onClick={() => onPreview(role)}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="button button-gold button-block"
        onClick={() => onPreview('admin')}
      >
        Voir le tableau de bord
        <ArrowRight size={18} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="text-button text-button-center"
        onClick={() => setShowHelp((value) => !value)}
        aria-expanded={showHelp}
      >
        {showHelp ? 'Masquer la configuration' : 'Comment configurer le serveur ?'}
      </button>

      {showHelp && (
        <div className="setup-help">
          <ol>
            <li>
              Copier le fichier <code>.env.example</code> en <code>.env.local</code>.
            </li>
            <li>
              Renseigner <code>VITE_SUPABASE_URL</code> et{' '}
              <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
            </li>
            <li>
              Redémarrer avec <code>npm run dev</code>.
            </li>
          </ol>
          <p>
            Le script de création des comptes utilise une clé de service uniquement sur la machine
            de l’administrateur, jamais dans l’application web.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}

export function LoginScreen() {
  const { signIn, busy, error, notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError('Saisis ton adresse e-mail.');
      return;
    }

    if (!password) {
      setLocalError('Saisis ton mot de passe.');
      return;
    }

    await signIn(email, password);
  };

  const message = localError ?? error;

  return (
    <AuthLayout caption="Connexion">
      <h2 className="auth-title">Heureux de te revoir</h2>
      <p className="auth-text">
        Connecte-toi avec le compte fourni par l’administrateur de la boutique.
      </p>

      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>Adresse e-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            inputMode="email"
            placeholder="prenom@merceriepdj.test"
            disabled={busy}
            required
          />
        </label>

        <label className="field">
          <span>Mot de passe</span>
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Mot de passe"
              disabled={busy}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}

        <button type="submit" className="button button-gold button-block" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Connexion…
            </>
          ) : (
            <>
              Se connecter
              <LogIn size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <p className="form-hint">
        À la première connexion, tu choisiras un code personnel à quatre chiffres pour rouvrir
        l’application sans mot de passe.
      </p>
    </AuthLayout>
  );
}

export function PinSetupScreen() {
  const { status, setupPin, signOut, busy, error } = useAuth();
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (status.kind !== 'pin_setup') {
    return null;
  }

  const handleDigit = (digit: string) => {
    if (busy) {
      return;
    }

    const next = pin + digit;

    if (next.length < 4) {
      setPin(next);
      return;
    }

    setPin('');
    setLocalError(null);

    if (step === 'choose') {
      setFirstPin(next);
      setStep('confirm');
      return;
    }

    if (next !== firstPin) {
      setFirstPin('');
      setStep('choose');
      setLocalError('Les deux codes ne correspondent pas. Choisis un nouveau code.');
      return;
    }

    void setupPin(next);
  };

  const restart = () => {
    setFirstPin('');
    setStep('choose');
    setPin('');
    setLocalError(null);
  };

  const message = localError ?? error;

  return (
    <AuthLayout caption="Première connexion">
      <div className="user-chip">
        <span className="avatar">{initialsFromName(status.profile.nom)}</span>
        <div>
          <strong>{status.profile.nom}</strong>
          <span>
            {ROLE_LABELS[status.profile.role]} · {status.profile.email}
          </span>
        </div>
      </div>

      <h2 className="auth-title">
        {step === 'choose' ? 'Choisis ton code à 4 chiffres' : 'Confirme ton code'}
      </h2>
      <p className="auth-text">
        {step === 'choose'
          ? 'Ce code reste sur cet appareil. Il sert à rouvrir l’application rapidement, sans mot de passe.'
          : 'Saisis le même code une seconde fois pour éviter une erreur.'}
      </p>

      <PinDots filled={pin.length} />

      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}

      <PinPad
        onDigit={handleDigit}
        onBackspace={() => setPin((value) => value.slice(0, -1))}
        disabled={busy}
      />

      <div className="pin-actions">
        {step === 'confirm' ? (
          <button type="button" className="text-button" onClick={restart} disabled={busy}>
            Recommencer
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => void signOut()}
          disabled={busy}
        >
          Annuler et se déconnecter
        </button>
      </div>

      <p className="form-hint">
        Évite une date de naissance ou 0000 si le code est connu de tous. L’administrateur peut
        réinitialiser l’accès à tout moment.
      </p>
    </AuthLayout>
  );
}

export function LockScreen() {
  const { status, unlock, signOut, busy, error } = useAuth();
  const [pin, setPin] = useState('');

  if (status.kind !== 'locked') {
    return null;
  }

  const handleDigit = (digit: string) => {
    if (busy) {
      return;
    }

    const next = pin + digit;

    if (next.length < 4) {
      setPin(next);
      return;
    }

    setPin('');
    void unlock(next);
  };

  const usePassword = () => {
    const confirmed = window.confirm(
      'Le code enregistré sera effacé de cet appareil. Te reconnecter avec le mot de passe ?',
    );

    if (confirmed) {
      void signOut();
    }
  };

  return (
    <AuthLayout caption="Application verrouillée">
      <div className="lock-badge">
        <Lock size={20} aria-hidden="true" />
        <span>Session protégée</span>
      </div>

      <h2 className="auth-title">Saisis ton code</h2>
      <p className="auth-text">
        {status.email}
        <br />
        La boutique reste verrouillée jusqu’à la saisie du code personnel.
      </p>

      <PinDots filled={pin.length} />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <PinPad
        onDigit={handleDigit}
        onBackspace={() => setPin((value) => value.slice(0, -1))}
        disabled={busy}
      />

      <button type="button" className="text-button text-button-center" onClick={usePassword}>
        <KeyRound size={16} aria-hidden="true" />
        Utiliser mon mot de passe
      </button>
    </AuthLayout>
  );
}

function PinDots({ filled }: { readonly filled: number }) {
  return (
    <div
      className="pin-dots"
      role="status"
      aria-label={`Code saisi : ${filled} chiffre${filled > 1 ? 's' : ''} sur 4`}
    >
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className={`pin-dot${index < filled ? ' is-filled' : ''}`} />
      ))}
    </div>
  );
}

function PinPad({
  onDigit,
  onBackspace,
  disabled,
}: {
  readonly onDigit: (digit: string) => void;
  readonly onBackspace: () => void;
  readonly disabled: boolean;
}) {
  return (
    <div className="pin-pad" aria-label="Clavier numérique">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <button
          key={digit}
          type="button"
          onClick={() => onDigit(digit)}
          disabled={disabled}
          aria-label={`Chiffre ${digit}`}
        >
          {digit}
        </button>
      ))}
      <span className="pin-pad-spacer" aria-hidden="true" />
      <button type="button" onClick={() => onDigit('0')} disabled={disabled} aria-label="Chiffre 0">
        0
      </button>
      <button
        type="button"
        className="pin-backspace"
        onClick={onBackspace}
        disabled={disabled}
        aria-label="Effacer le dernier chiffre"
      >
        ⌫
      </button>
    </div>
  );
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
