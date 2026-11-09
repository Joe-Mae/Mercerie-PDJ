import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LockScreen, LoginScreen, PinSetupScreen, SetupRequiredScreen } from './auth/AuthScreens';
import { DEMO_PROFILES, type DemoActor } from './data/demo';
import { isSupabaseConfigured } from './lib/supabase';
import type { AppRole } from './types';
import { Workspace } from './ui/Workspace';

const PREVIEW_ACTORS: readonly DemoActor[] = ['admin', 'owner', 'cashier', 'seller'];

function initialPreview(): DemoActor | null {
  if (isSupabaseConfigured) {
    return null;
  }

  const requested = new URLSearchParams(window.location.search).get('apercu');
  return PREVIEW_ACTORS.find((actor) => actor === requested) ?? null;
}

function setPreviewInUrl(role: DemoActor | null): void {
  const url = new URL(window.location.href);

  if (role) {
    url.searchParams.set('apercu', role);
  } else {
    url.searchParams.delete('apercu');
    url.searchParams.delete('page');
  }

  window.history.replaceState({}, '', url);
}

export function App() {
  const [demoRole, setDemoRole] = useState<DemoActor | null>(initialPreview);

  const openPreview = (role: AppRole) => {
    setDemoRole(role);
    setPreviewInUrl(role);
  };

  const closePreview = () => {
    setDemoRole(null);
    setPreviewInUrl(null);
  };

  if (demoRole) {
    return (
      <Workspace
        profile={DEMO_PROFILES[demoRole]}
        isOnline
        demo
        onLock={closePreview}
        onSignOut={closePreview}
      />
    );
  }

  return (
    <AuthProvider>
      <AuthGate onPreview={openPreview} />
    </AuthProvider>
  );
}

function AuthGate({ onPreview }: { readonly onPreview: (role: AppRole) => void }) {
  const { status, isOnline, lock, signOut } = useAuth();

  switch (status.kind) {
    case 'setup_required':
      return <SetupRequiredScreen onPreview={onPreview} />;
    case 'signed_out':
      return <LoginScreen />;
    case 'pin_setup':
      return <PinSetupScreen />;
    case 'locked':
      return <LockScreen />;
    case 'unlocked':
      return (
        <Workspace
          profile={status.profile}
          isOnline={isOnline}
          demo={false}
          onLock={lock}
          onSignOut={() => void signOut()}
        />
      );
  }
}
