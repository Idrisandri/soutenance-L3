import { useState, useEffect } from 'react';
import { getConversations } from '../services/ragApi';

export default function Sidebar({ activeConversationId, onSelectConversation, onNewConversation }) {
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    getConversations()
      .then((data) => setConversations(data.conversations || []))
      .catch(() => setConversations([]));
  }, [activeConversationId]); // recharge la liste après chaque nouvel échange

  return (
    <div className="w-64 bg-gray-50 border-r h-screen flex flex-col">
      <div className="p-3 border-b">
        <button
          onClick={onNewConversation}
          className="w-full bg-blue-600 text-white text-sm py-2 rounded-md hover:bg-blue-700"
        >
          + Nouvelle conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="text-xs text-gray-400 p-3">Aucune conversation pour l'instant</p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.conversation_id}
            onClick={() => onSelectConversation(conv.conversation_id)}
            className={`w-full text-left px-3 py-2 text-sm border-b hover:bg-gray-100 truncate ${
              conv.conversation_id === activeConversationId ? 'bg-gray-200 font-medium' : ''
            }`}
          >
            {conv.titre}
          </button>
        ))}
      </div>
    </div>
  );
}