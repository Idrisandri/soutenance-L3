import { useState, useEffect, useRef } from 'react';
import { useAsk } from '../hooks/useAsk';
import { getHistory } from '../services/ragApi';
import Sidebar from '../components/Sidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function nouvelId() {
  const id = crypto.randomUUID();
  localStorage.setItem('conversation_id', id);
  return id;
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
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

export default function AskPage({ user, onSignOut }) {
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
    <div className="flex h-screen overflow-hidden bg-white">
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-slate-500 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-100"
              aria-label="Basculer la sidebar"
            >
              <MenuIcon />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">Aether AI Chat Assistant</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-full">
              AI Status: Online
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </span>
            <button className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm">
              <SettingsIcon />
              Settings
            </button>
            <div className="w-8 h-8 rounded-full bg-slate-200" />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-6 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                {/* Question — alignée à droite, bulle bleu marine */}
                <div className="flex justify-end">
                  <div className="bg-[#0B1220] text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[75%] text-sm">
                    {m.question}
                  </div>
                </div>

                {/* Réponse — alignée à gauche, bulle grise avec rendu markdown */}
                <div className="flex justify-start">
                  {m.reponse === null ? (
                    <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                    </div>
                  ) : (
                    <div className="bg-slate-100 text-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[75%] text-sm prose prose-sm prose-slate max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-li:my-0.5">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.reponse}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
            </div>
          </div>

          {error && <p className="max-w-3xl mx-auto text-red-600 text-sm px-6 shrink-0">{error}</p>}

          <div className="border-t border-slate-200 shrink-0">
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-center gap-2 p-4">
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100"
                aria-label="Joindre un fichier"
              >
                <PaperclipIcon />
              </button>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type your message or ask a question..."
                className="flex-1 border border-slate-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1220]/20"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-[#0B1220] text-white w-10 h-10 flex items-center justify-center rounded-full disabled:opacity-50 hover:bg-[#0B1220]/90 transition-colors"
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