import { useState } from 'react';
import { askQuestion } from '../services/ragApi';

export function useAsk() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function ask(question, conversationId) {
    setLoading(true);
    setError(null);
    try {
      const data = await askQuestion(question, conversationId);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return { ask, loading, error, result };
}