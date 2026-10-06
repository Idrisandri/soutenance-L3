import { useState, useEffect, useRef } from 'react';
import { useAsk } from '../hooks/useAsk';
import { getHistory } from '../services/ragApi';
import Sidebar from '../components/Sidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../context/ThemeContext';

function nouvelId() {
  const id = crypto.randomUUID();
  localStorage.setItem('conversation_id', id);
  return id;
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
    </svg>
  );
}

export default function AskPage({ user, onSignOut, onGoHome }) {
  const { theme } = useTheme();
  const [conversationId, setConversationId] = useState(() => {
    return localStorage.getItem('conversation_id') || nouvelId();
  });

  const { ask, loading, error, result } = useAsk();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef(null);

  useEffect(() => {
    getHistory(conversationId)
      .then((data) => setMessages(data.messages || []))
      .catch(() => setMessages([]));
  }, [conversationId]);

  useEffect(() => {
    if (result) {
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].reponse === null) {
            updated[i] = { ...updated[i], reponse: result.reponse };
            break;
          }
        }
        return updated;
      });
    }
  }, [result]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setMessages((prev) => [...prev, { question: q, reponse: null }]);
    ask(q, conversationId);
    setQuestion('');
  }

  function handleNewConversation() {
    const id = nouvelId();
    setConversationId(id);
    setMessages([]);
  }

  function handleSelectConversation(id) {
    localStorage.setItem('conversation_id', id);
    setConversationId(id);
  }

  return (
    <div className="bg-stage flex h-dvh overflow-hidden">
      <Sidebar
        activeConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        user={user}
        onSignOut={onSignOut}
        open={sidebarOpen}
      />

      <div className="flex-1 flex flex-col min-h-0">
        {/* En-tête */}
        <div className="border-line flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-muted hover:bg-bubble hover:text-ink rounded-md p-1.5 transition-colors"
              aria-label="Basculer la sidebar"
            >
              <MenuIcon />
            </button>
            <h1 className="text-ink text-lg font-medium">Agent IA</h1>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              type="button"
              onClick={onGoHome}
              className="text-muted hover:text-ink text-sm transition-colors"
            >
              Accueil
            </button>
            <span className="border-line text-soft flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
              En ligne
              <span className="bg-fill h-2 w-2 rounded-full" />
            </span>
            <div className="bg-chip text-soft flex h-8 w-8 items-center justify-center rounded-full">
              <span className="text-[11px] font-medium">VA</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-4 p-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center pt-16 text-center">
                <img src="/oeil.png" alt="" className="w-40 select-none opacity-90" draggable="false" />
                <p className="text-ink mt-6 text-2xl font-medium tracking-tight">Voyez le marché avant d&apos;agir</p>
                <p className="text-muted mt-2 max-w-sm text-sm">
                  Interrogez l&apos;agent en langage naturel.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                {/* Question — alignée à droite, bulle bleu marine */}
                <div className="flex justify-end">
                  <div className="bg-fill text-fill-ink max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
                    {m.question}
                  </div>
                </div>

                {/* Réponse — alignée à gauche, bulle grise avec rendu markdown */}
                <div className="flex justify-start">
                  {m.reponse === null ? (
                    <div className="border-line bg-bubble flex items-center gap-1 rounded-2xl rounded-bl-sm border px-4 py-3">
                      <span className="bg-muted h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
                      <span className="bg-muted h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
                      <span className="bg-muted h-1.5 w-1.5 animate-bounce rounded-full" />
                    </div>
                  ) : (
                    <div className={`border-line bg-bubble text-ink max-w-[75%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm prose prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-li:my-0.5 ${theme === 'dark' ? 'prose-invert' : ''}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.reponse}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
            </div>
          </div>

          {error && <p className="mx-auto max-w-3xl shrink-0 px-6 text-sm text-red-400">{error}</p>}

          <div className="border-line shrink-0 border-t">
            <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl items-center gap-2 p-4">
              <button
                type="button"
                className="text-muted hover:bg-bubble hover:text-ink rounded-full p-2 transition-colors"
                aria-label="Joindre un fichier"
              >
                <PaperclipIcon />
              </button>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Interrogez l'agent en langage naturel..."
                className="border-field-border bg-field text-ink placeholder:text-muted focus:border-ink/30 flex-1 rounded-full border px-4 py-2.5 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-fill text-fill-ink flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-[1.03] disabled:opacity-50"
                aria-label="Envoyer"
              >
                <SendIcon />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}