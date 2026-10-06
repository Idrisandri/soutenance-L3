import { useEffect, useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';

const NAV = [
  { id: 'home', label: 'Accueil' },
  { id: 'features', label: 'Fonctionnalités' },
  { id: 'about', label: 'À propos' },
];

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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5.5 19.2c1.4-2.6 3.7-3.9 6.5-3.9s5.1 1.3 6.5 3.9" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 3.5v8" />
      <path d="M7.2 6.4a7 7 0 1 0 9.6 0" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 7.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}

function EyeVisual({ className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <div
        className="pointer-events-none absolute left-1/2 top-[78%] h-10 w-[70%] -translate-x-1/2 rounded-[100%] bg-black/70 blur-2xl"
        aria-hidden="true"
      />
      <img
        src="/oeil.png"
        alt=""
        className="eye-shadow relative w-full select-none object-contain"
        draggable="false"
      />
    </div>
  );
}

export default function HomePage({ user, onLogin, onOpenAgent, onSignOut, startPanel = 'home', onPanelChange }) {
  const [panel, setPanel] = useState(startPanel);

  useEffect(() => {
    setPanel(startPanel);
  }, [startPanel]);

  function selectPanel(next) {
    setPanel(next);
    onPanelChange?.(next);
  }

  function openAgent() {
    onOpenAgent();
  }

  return (
    <div className="bg-stage h-dvh overflow-hidden">
      <section className="relative flex h-full w-full flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-8 lg:px-10 lg:pt-6">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] sm:gap-8 sm:text-sm">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectPanel(item.id)}
                className={
                  panel === item.id
                    ? 'text-ink'
                    : 'text-muted transition-colors hover:text-ink'
                }
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={openAgent}
              className="text-muted transition-colors hover:text-ink"
            >
              Agent IA
            </button>
          </nav>

          <div className="text-soft flex shrink-0 items-center gap-3 text-sm sm:gap-4">
            <ThemeToggle />
            <button
              type="button"
              onClick={openAgent}
              className="text-soft transition-colors hover:text-ink"
              aria-label="Rechercher"
            >
              <SearchIcon />
            </button>
            <span className="bg-chip text-soft hidden h-8 w-8 items-center justify-center rounded-full sm:inline-flex">
              <UserIcon />
            </span>
            <button
              type="button"
              onClick={user ? openAgent : onLogin}
              className="text-ink whitespace-nowrap transition-colors hover:text-ink"
            >
              {user ? 'Mon espace' : 'Se connecter'}
            </button>
          </div>
        </header>

        {panel === 'home' ? (
          <div className="grid flex-1 grid-cols-1 items-center gap-2 px-5 pb-4 pt-2 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28">
            <EyeVisual className="mx-auto w-[min(100%,46vw,620px)] translate-y-2 lg:ml-0 lg:translate-y-4" />

            <div className="max-w-md lg:self-center lg:-translate-y-4">
              <h1 className="text-ink text-[2.35rem] font-medium leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-[3.35rem]">
                Voyez le marché
                <br />
                avant d&apos;agir
              </h1>
              <p className="text-muted mt-5 max-w-sm text-sm leading-relaxed sm:text-[15px]">
                Suivez les prix de vos concurrents et interrogez
                <br className="hidden sm:block" /> l&apos;agent IA en langage naturel.
              </p>
              <button
                type="button"
                onClick={openAgent}
                className="bg-fill text-fill-ink mt-7 rounded-full px-5 py-2.5 text-sm font-medium transition-transform hover:scale-[1.02]"
              >
                Découvrir l&apos;agent
              </button>
            </div>
          </div>
        ) : null}

        {panel === 'features' ? (
          <div className="flex flex-1 flex-col justify-center px-6 pb-28 pt-8 sm:px-10 lg:px-14">
            <p className="text-muted text-xs uppercase tracking-[0.18em]">Fonctionnalités</p>
            <h2 className="mt-3 max-w-xl text-3xl font-medium tracking-tight sm:text-4xl">
              Le marché, lisible avant la décision.
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ['Prix concurrents', 'Les tarifs du marché sont suivis pour voir où vous vous situez.'],
                ['Agent en langage naturel', 'Posez une question comme à un collègue, sans formulaire.'],
                ['Avant d’agir', 'La réponse arrive avant le changement de prix ou l’offre.'],
              ].map(([title, text]) => (
                <article key={title} className="border-line bg-bubble rounded-2xl border p-5">
                  <h3 className="text-ink text-base font-medium">{title}</h3>
                  <p className="text-muted mt-2 text-sm leading-relaxed">{text}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {panel === 'about' ? (
          <div className="flex flex-1 flex-col justify-center px-6 pb-28 pt-8 sm:px-10 lg:max-w-2xl lg:px-14">
            <p className="text-muted text-xs uppercase tracking-[0.18em]">À propos</p>
            <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Voir avant d&apos;agir</h2>
            <p className="text-muted mt-5 text-sm leading-relaxed sm:text-base">
              Cet espace relie le suivi des prix concurrents à un agent que vous interrogez en français.
              L&apos;idée est simple : comprendre le marché, puis décider.
            </p>
          </div>
        ) : null}

        <div className="mt-auto grid grid-cols-[1fr_auto] items-center gap-3 px-5 pb-5 sm:px-8 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0 lg:grid-cols-[1fr_auto_1fr] lg:items-end lg:px-10 lg:pb-6">
          <p className="text-soft text-sm sm:text-base lg:pointer-events-auto">Voir avant d&apos;agir</p>

          <button
            type="button"
            onClick={user ? onSignOut : undefined}
            className="text-soft hover:text-ink flex h-9 w-9 items-center justify-center rounded-full transition-colors lg:pointer-events-auto lg:col-start-2 lg:justify-self-center"
            aria-label={user ? 'Se déconnecter' : 'Veille'}
          >
            <PowerIcon />
          </button>

          {panel === 'home' ? (
            <button
              type="button"
              onClick={openAgent}
              className="border-line bg-sidebar text-ink col-span-2 flex w-[210px] items-center justify-self-end gap-3 rounded-2xl border px-4 py-4 text-left text-sm shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-colors hover:border-field-border sm:w-[240px] lg:pointer-events-auto lg:col-span-1 lg:col-start-3 lg:py-5"
            >
              <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-black">
                <img
                  src="/oeil.png"
                  alt=""
                  className="h-full w-full scale-[1.8] object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="bg-fill text-fill-ink flex h-6 w-6 items-center justify-center rounded-full">
                    <PlayIcon />
                  </span>
                </span>
              </span>
              Voir la démo
            </button>
          ) : (
            <span className="hidden lg:block" />
          )}
        </div>
      </section>
    </div>
  );
}
