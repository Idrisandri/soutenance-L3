import { useEffect, useState } from 'react';

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
        className="relative w-full select-none object-contain drop-shadow-[0_28px_36px_rgba(0,0,0,0.55)]"
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
    <div className="h-dvh overflow-hidden bg-[#141414] text-white">
      <section className="relative flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(120%_90%_at_30%_58%,_#2b2b2b_0%,_#1c1c1c_46%,_#141414_100%)]">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-8 lg:px-10 lg:pt-6">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] sm:gap-8 sm:text-sm">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectPanel(item.id)}
                className={
                  panel === item.id
                    ? 'text-white'
                    : 'text-neutral-400 transition-colors hover:text-white'
                }
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={openAgent}
              className="text-neutral-400 transition-colors hover:text-white"
            >
              Agent IA
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-3 text-sm text-neutral-200 sm:gap-4">
            <button
              type="button"
              onClick={openAgent}
              className="text-neutral-300 transition-colors hover:text-white"
              aria-label="Rechercher"
            >
              <SearchIcon />
            </button>
            <span className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-neutral-300">
              <UserIcon />
            </span>
            <button
              type="button"
              onClick={user ? openAgent : onLogin}
              className="whitespace-nowrap text-neutral-100 transition-colors hover:text-white"
            >
              {user ? 'Mon espace' : 'Se connecter'}
            </button>
          </div>
        </header>

        {panel === 'home' ? (
          <div className="grid flex-1 grid-cols-1 items-center gap-2 px-5 pb-4 pt-2 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:pb-28">
            <EyeVisual className="mx-auto w-[min(100%,46vw,620px)] translate-y-2 lg:ml-0 lg:translate-y-4" />

            <div className="max-w-md lg:self-center lg:-translate-y-4">
              <h1 className="text-[2.35rem] font-medium leading-[1.05] tracking-[-0.03em] text-white sm:text-5xl lg:text-[3.35rem]">
                Voyez le marché
                <br />
                avant d&apos;agir
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-neutral-400 sm:text-[15px]">
                Suivez les prix de vos concurrents et interrogez
                <br className="hidden sm:block" /> l&apos;agent IA en langage naturel.
              </p>
              <button
                type="button"
                onClick={openAgent}
                className="mt-7 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-neutral-950 transition-transform hover:scale-[1.02]"
              >
                Découvrir l&apos;agent
              </button>
            </div>
          </div>
        ) : null}

        {panel === 'features' ? (
          <div className="flex flex-1 flex-col justify-center px-6 pb-28 pt-8 sm:px-10 lg:px-14">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Fonctionnalités</p>
            <h2 className="mt-3 max-w-xl text-3xl font-medium tracking-tight sm:text-4xl">
              Le marché, lisible avant la décision.
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ['Prix concurrents', 'Les tarifs du marché sont suivis pour voir où vous vous situez.'],
                ['Agent en langage naturel', 'Posez une question comme à un collègue, sans formulaire.'],
                ['Avant d’agir', 'La réponse arrive avant le changement de prix ou l’offre.'],
              ].map(([title, text]) => (
                <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="text-base font-medium text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{text}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {panel === 'about' ? (
          <div className="flex flex-1 flex-col justify-center px-6 pb-28 pt-8 sm:px-10 lg:max-w-2xl lg:px-14">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">À propos</p>
            <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Voir avant d&apos;agir</h2>
            <p className="mt-5 text-sm leading-relaxed text-neutral-400 sm:text-base">
              Cet espace relie le suivi des prix concurrents à un agent que vous interrogez en français.
              L&apos;idée est simple : comprendre le marché, puis décider.
            </p>
          </div>
        ) : null}

        <div className="mt-auto grid grid-cols-[1fr_auto] items-center gap-3 px-5 pb-5 sm:px-8 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0 lg:grid-cols-[1fr_auto_1fr] lg:items-end lg:px-10 lg:pb-6">
          <p className="text-sm text-neutral-200 sm:text-base lg:pointer-events-auto">Voir avant d&apos;agir</p>

          <button
            type="button"
            onClick={user ? onSignOut : undefined}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-300 transition-colors hover:text-white lg:pointer-events-auto lg:col-start-2 lg:justify-self-center"
            aria-label={user ? 'Se déconnecter' : 'Veille'}
          >
            <PowerIcon />
          </button>

          {panel === 'home' ? (
            <button
              type="button"
              onClick={openAgent}
              className="col-span-2 flex w-[210px] justify-self-end items-center gap-3 rounded-2xl border border-white/10 bg-[#121212] px-4 py-4 text-left text-sm text-neutral-100 shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-colors hover:border-white/20 sm:w-[240px] lg:pointer-events-auto lg:col-span-1 lg:col-start-3 lg:py-5"
            >
              <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-black">
                <img
                  src="/oeil.png"
                  alt=""
                  className="h-full w-full scale-[1.8] object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-black">
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
