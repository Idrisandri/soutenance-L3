import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AskPage from './pages/AskPage';
import HomePage from './pages/HomePage';

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const [screen, setScreen] = useState('home');
  const [homePanel, setHomePanel] = useState('home');

  useEffect(() => {
    if (user && (screen === 'login' || screen === 'register')) {
      setScreen('agent');
    }
  }, [user, screen]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#3d3d3d] text-sm text-neutral-300">
        Chargement...
      </div>
    );
  }

  if (user && screen === 'agent') {
    return (
      <AskPage
        user={user}
        onGoHome={() => setScreen('home')}
        onSignOut={() => {
          signOut();
          setScreen('home');
        }}
      />
    );
  }

  if (!user && screen === 'login') {
    return (
      <LoginPage
        onSwitchToRegister={() => setScreen('register')}
        onGoHome={(panel = 'home') => {
          setHomePanel(panel);
          setScreen('home');
        }}
      />
    );
  }

  if (!user && screen === 'register') {
    return (
      <RegisterPage
        onSwitchToLogin={() => setScreen('login')}
        onGoHome={(panel = 'home') => {
          setHomePanel(panel);
          setScreen('home');
        }}
      />
    );
  }

  return (
    <HomePage
      user={user}
      startPanel={homePanel}
      onPanelChange={setHomePanel}
      onLogin={() => setScreen('login')}
      onOpenAgent={() => setScreen(user ? 'agent' : 'login')}
      onSignOut={() => {
        signOut();
        setScreen('home');
      }}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
