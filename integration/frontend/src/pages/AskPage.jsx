import { useState, useEffect } from 'react';
import { useAsk } from '../hooks/useAsk';
import { getHistory } from '../services/ragApi';
import Sidebar from '../components/Sidebar';

function nouvelId() {
  const id = crypto.randomUUID();
  localStorage.setItem('conversation_id', id);
  return id;
}

export default function AskPage() {
  const [conversationId, setConversationId] = useState(() => {
    return localStorage.getItem('conversation_id') || nouvelId();
  });

  const { ask, loading, error, result } = useAsk();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    getHistory(conversationId)
      .then((data) => setMessages(data.messages || []))
      .catch(() => setMessages([]));
  }, [conversationId]);

  useEffect(() => {
    if (result) {
      setMessages((prev) => [...prev, { question, reponse: result.reponse }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!question.trim()) return;
    ask(question, conversationId);
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
    <div className="flex">
      <Sidebar
        activeConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />

      <div className="flex-1 p-8 max-w-2xl mx-auto space-y-4">
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className="space-y-1">
              <p className="text-sm font-medium text-gray-800">{m.question}</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 border rounded-md p-3">
                {m.reponse}
              </p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pose ta question sur la concurrence..."
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
          >
            {loading ? '...' : 'Envoyer'}
          </button>
        </form>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  );
}