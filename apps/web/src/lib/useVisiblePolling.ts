import { useEffect, useRef } from 'react';

interface VisiblePollingOptions {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly minGapMs?: number;
  readonly refreshOnOnline?: boolean;
}

export function useVisiblePolling(
  task: () => void | Promise<void>,
  { enabled, intervalMs, minGapMs = 30_000, refreshOnOnline = false }: VisiblePollingOptions,
): void {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let lastRunAt = Date.now();
    let running = false;

    const run = (respectGap: boolean) => {
      if (running || document.visibilityState !== 'visible' || !navigator.onLine) {
        return;
      }
      if (respectGap && Date.now() - lastRunAt < minGapMs) {
        return;
      }

      running = true;
      lastRunAt = Date.now();
      void Promise.resolve()
        .then(() => taskRef.current())
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        run(true);
      }
    };
    const onOnline = () => run(false);

    const interval = window.setInterval(() => run(true), intervalMs);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (refreshOnOnline) {
      window.addEventListener('online', onOnline);
    }

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, intervalMs, minGapMs, refreshOnOnline]);
}
