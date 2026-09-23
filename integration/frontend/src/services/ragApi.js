import { apiFetch } from './apiClient';

export function askQuestion(question, conversationId) {
  return apiFetch('/ask', {
    method: 'POST',
    body: JSON.stringify({ question, conversation_id: conversationId }),
  });
}

export function getHistory(conversationId) {
  return apiFetch(`/history/${conversationId}`, {
    method: 'GET',
  });
}

export function getConversations() {
  return apiFetch('/conversations', { method: 'GET' });
}