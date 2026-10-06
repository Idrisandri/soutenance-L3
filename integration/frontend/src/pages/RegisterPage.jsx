import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20.5 21" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5.5 19.2c1.4-2.6 3.7-3.9 6.5-3.9s5.1 1.3 6.5 3.9" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3.5h2.2l1.2 3-1.6 1a12 12 0 0 0 5.7 5.7l1-1.6 3 1.2V17a2 2 0 0 1-2.2 2A16 16 0 0 1 5 7.7 2 2 0 0 1 7 5.5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon({ off = false }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9.5 4.2 11 7-0.6 1.1-1.5 2.3-2.6 3.4" />
      <path d="M6.1 6.6C4.4 7.8 3 9.4 2 12c1.2 2.2 4.2 6 10 6 1.2 0 2.3-.2 3.3-.6" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const fieldClass =
  'w-full rounded-xl border border-white/15 bg-black/20 py-3 pl-11 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/40';

function Shell({ onGoHome, onSwitchToLogin, children }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(120%_90%_at_30%_58%,_#2b2b2b_0%,_#1c1c1c_46%,_#141414_100%)] text-white">
      <header className="flex items-center justify-between gap-4 px-6 pt-6 sm:px-10">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-300">
          <button type="button" onClick={() => onGoHome?.('home')} className="text-white">
            Accueil
          </button>
          <button type="button" onClick={() => onGoHome?.('features')} className="transition-colors hover:text-white">
            Fonctionnalités
          </button>
          <button type="button" className="text-white">
            Agent IA
          </button>
          <button type="button" onClick={() => onGoHome?.('about')} className="transition-colors hover:text-white">
            À propos
          </button>
        </nav>
        <div className="flex items-center gap-3 text-sm text-neutral-200">
          <button type="button" aria-label="Rechercher" className="text-neutral-300 transition-colors hover:text-white">
            <SearchIcon />
          </button>
          <button type="button" onClick={onSwitchToLogin} className="transition-colors hover:text-white">
            Mon Profil
          </button>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700/80 text-neutral-200">
            <UserIcon />
          </span>
        </div>
      </header>

      <main className="grid min-h-0 flex-1">
        <section className="grid min-h-0 lg:grid-cols-2">
          {children}
          <div className="relative hidden min-h-0 flex-col justify-end px-10 pb-10 lg:flex">
            <img
              src="/oeil.png"
              alt=""
              className="pointer-events-none absolute left-1/2 top-1/2 w-[min(78%,560px)] -translate-x-1/2 -translate-y-[54%] select-none drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)]"
              draggable="false"
            />
            <p className="relative z-10 flex items-center gap-3 text-sm text-neutral-200">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-[11px] font-medium tracking-wide">
                VA
              </span>
              Voyez le marché avant d&apos;agir.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function RegisterPage({ onSwitchToLogin, onGoHome }) {
  const { signUp } = useAuth();
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!accepted) {
      setError("Accepte les conditions d'utilisation pour créer un compte.");
      return;
    }
    setLoading(true);

    const { error: signUpError } = await signUp(email, password, {
      full_name: nom,
      phone: telephone,
    });

    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <Shell onGoHome={onGoHome} onSwitchToLogin={onSwitchToLogin}>
        <div className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-10 sm:px-8">
          <h1 className="text-4xl font-medium tracking-tight">Compte créé</h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            Vérifie ta boîte mail pour confirmer ton compte avant de te connecter.
          </p>
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="mt-8 w-full rounded-full bg-white py-3 text-sm font-medium text-neutral-950"
          >
            Se connecter
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onGoHome={onGoHome} onSwitchToLogin={onSwitchToLogin}>
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-md flex-col justify-center overflow-y-auto px-6 py-8 sm:px-8">
        <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">Créer un compte</h1>
        <p className="mt-2 text-sm text-neutral-400">Rejoignez votre espace en quelques secondes</p>

        <label className="mt-6 block text-sm text-neutral-200" htmlFor="register-name">
          Nom complet
        </label>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
            <UserIcon />
          </span>
          <input
            id="register-name"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            placeholder="Jean Rakoto"
            autoComplete="name"
            className={fieldClass}
          />
        </div>

        <label className="mt-4 block text-sm text-neutral-200" htmlFor="register-phone">
          Numéro de téléphone
        </label>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
            <PhoneIcon />
          </span>
          <input
            id="register-phone"
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            required
            placeholder="+261 34 00 000 00"
            autoComplete="tel"
            className={fieldClass}
          />
        </div>

        <label className="mt-4 block text-sm text-neutral-200" htmlFor="register-email">
          Email
        </label>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
            <MailIcon />
          </span>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="nom@entreprise.com"
            autoComplete="email"
            className={fieldClass}
          />
        </div>

        <label className="mt-4 block text-sm text-neutral-200" htmlFor="register-password">
          Mot de passe
        </label>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
            <LockIcon />
          </span>
          <input
            id="register-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
            autoComplete="new-password"
            className={`${fieldClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 transition-colors hover:text-white"
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="h-4 w-4 rounded border-white/30 bg-transparent accent-white"
          />
          J&apos;accepte les conditions d&apos;utilisation
        </label>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-full bg-white py-3 text-sm font-medium text-neutral-950 transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          {loading ? 'Création...' : 'Créer mon compte'}
        </button>

        <p className="mt-4 text-center text-sm text-neutral-400">
          Déjà un compte ?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-neutral-100 underline underline-offset-2 hover:text-white"
          >
            Se connecter
          </button>
        </p>
      </form>
    </Shell>
  );
}
