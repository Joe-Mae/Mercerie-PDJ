import { useCallback, useEffect, useState } from 'react';
import { isInstalledApp, isIosDevice } from '../lib/platform';

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
  prompt: () => Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

export type InstallMode = 'installed' | 'installable' | 'ios' | 'unavailable';

export interface InstallState {
  readonly mode: InstallMode;
  readonly dismissed: boolean;
  readonly installing: boolean;
  readonly error: string | null;
}

const DISMISS_KEY = 'mercerie:install-invitation';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = isInstalledApp();
let dismissed = readDismissed();
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function currentMode(): InstallMode {
  if (installed) {
    return 'installed';
  }
  if (deferredPrompt) {
    return 'installable';
  }
  return isIosDevice() ? 'ios' : 'unavailable';
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notify();
});

window.addEventListener('appinstalled', () => {
  installed = true;
  deferredPrompt = null;
  notify();
});

export function useInstall(): {
  readonly state: InstallState;
  readonly install: () => Promise<void>;
  readonly dismiss: () => void;
} {
  const [mode, setMode] = useState(currentMode);
  const [isDismissed, setIsDismissed] = useState(dismissed);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setMode(currentMode());
      setIsDismissed(dismissed);
    };

    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  const install = useCallback(async () => {
    const prompt = deferredPrompt;
    if (!prompt) {
      setMode(currentMode());
      setError('Utilise le menu du navigateur pour installer l’application.');
      return;
    }

    setInstalling(true);
    setError(null);

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        installed = true;
      }
      setMode(currentMode());
    } catch {
      setError('L’installation n’a pas abouti. Réessaie depuis le menu du navigateur.');
    } finally {
      setInstalling(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    dismissed = true;
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Le stockage local est indisponible : l’invitation reviendra au prochain lancement.
    }
    setIsDismissed(true);
  }, []);

  return {
    state: { mode, dismissed: isDismissed, installing, error },
    install,
    dismiss,
  };
}
