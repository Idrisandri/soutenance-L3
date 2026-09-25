import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AskPage from './pages/AskPage';
import { useState } from 'react';

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const [mode, setMode] = useState('login');

  if (loading) return <p className="p-8">Chargement...</p>;

  if (!user) {
    return mode === 'login' ? (
      <LoginPage onSwitchToRegister={() => setMode('register')} />
    ) : (
      <RegisterPage onSwitchToLogin={() => setMode('login')} />
    );
  }

  return <AskPage user={user} onSignOut={signOut} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}