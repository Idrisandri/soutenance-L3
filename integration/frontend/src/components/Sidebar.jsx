import { useState, useEffect } from 'react';
import { getConversations, deleteConversation } from '../services/ragApi';

function LogoMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-[11px] font-medium tracking-wide">
      VA
    </span>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export default function Sidebar({ activeConversationId, onSelectConversation, onNewConversation, user, onSignOut, open = true }) {
  const [conversations, setConversations] = useState([]);

  function chargerConversations() {
    getConversations()
      .then((data) => setConversations(data.conversations || []))
      .catch(() => setConversations([]));
  }

  useEffect(() => {
    chargerConversations();
  }, [activeConversationId]); // recharge la liste après chaque nouvel échange

  async function handleDelete(e, conversationId) {
    e.stopPropagation(); // empêche de déclencher aussi le onSelectConversation du bouton parent
    if (!window.confirm('Supprimer cette conversation ? Cette action est irréversible.')) return;

    try {
      await deleteConversation(conversationId);
      chargerConversations();
      // Si on vient de supprimer la conversation actuellement ouverte,
      // on en démarre une nouvelle plutôt que de rester sur un id mort.
      if (conversationId === activeConversationId) {
        onNewConversation();
      }
    } catch (err) {
      alert("Erreur lors de la suppression : " + err.message);
    }
  }

  return (
    <div
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#141414] text-neutral-100 transition-all duration-300 ease-in-out ${
        open ? 'w-64' : 'w-0 border-r-0'
      }`}
    >
      <div className="w-64 h-full flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10 shrink-0">
          <LogoMark />
          <span className="text-sm font-medium tracking-tight">Agent IA</span>
        </div>

        {/* New chat button */}
        <div className="p-3 shrink-0">
          <button
            onClick={onNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-medium text-neutral-950 transition-transform hover:scale-[1.01]"
          >
            <PlusIcon />
            Nouvelle conversation
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1 pb-3">
          {conversations.length === 0 && (
            <p className="px-3 py-2 text-xs text-neutral-500">Aucune conversation pour l&apos;instant</p>
          )}
          {conversations.map((conv) => {
            const isActive = conv.conversation_id === activeConversationId;
            return (
              <div
                key={conv.conversation_id}
                onClick={() => onSelectConversation(conv.conversation_id)}
                className={`group w-full flex items-center gap-1 px-3 py-2.5 text-sm rounded-lg cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                <span className="flex-1 truncate">{conv.titre}</span>
                <button
                  onClick={(e) => handleDelete(e, conv.conversation_id)}
                  className="shrink-0 rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  aria-label="Supprimer cette conversation"
                  title="Supprimer"
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
        </div>

        {/* Profil connecté + déconnexion */}
        {user && (
          <div className="border-t border-white/10 p-3 flex items-center gap-2 shrink-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-300">
              <UserIcon />
            </div>
            <span className="flex-1 truncate text-xs text-neutral-300" title={user.email}>
              {user.email}
            </span>
            <button
              onClick={onSignOut}
              className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogoutIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}