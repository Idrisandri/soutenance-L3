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

  return (
    <div>
      <div className="flex justify-between items-center p-4 border-b">
        <span className="text-sm text-gray-600">Connecté : {user.email}</span>
        <button onClick={signOut} className="text-sm text-red-600 underline">
          Se déconnecter
        </button>
      </div>
      <AskPage />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}