import { useCallback, useEffect, useRef } from "react";

const DEBOUNCE_MS = 300;

interface PendingToggle {
  timer: ReturnType<typeof setTimeout>;
  /** The confirmed (server-side) value this cell had when this burst of taps started. */
  baseline: boolean;
  resolve: () => void;
}

/**
 * Returns a `toggleTick` function that debounces the actual network call per
 * `elementId+date` key (300ms). The toggle API flips whatever the row
 * currently holds — it isn't a "set to X" endpoint — so rapid repeated taps
 * on the same cell can't simply collapse into "send the last one": an even
 * number of taps nets back to the original (server-confirmed) value and
 * must send NO request at all, or a stray flip would desync the DB from
 * what the grid displays. Each call therefore remembers the `baseline`
 * value the burst started from (the first call's implied previous state,
 * `!next`) and only fires a request once the quiet period elapses, and only
 * if the final `next` actually differs from that baseline.
 *
 * On a non-OK response, throws — the caller (`TickCell`, via its own
 * `useOptimistic`) reverts its optimistic state and shows a retry toast. On
 * a 401, redirects to sign-in instead of throwing (every mutating action in
 * this app follows this convention — see `context/foundation/lessons.md`).
 */
export function useTrainingGrid(dogId: string) {
  const pendingRef = useRef(new Map<string, PendingToggle>());

  // If the grid unmounts (e.g. navigating away) within the debounce window,
  // a stray timer would otherwise still fire and POST after the user has
  // already left the page.
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      for (const { timer } of pending.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const toggleTick = useCallback(
    (elementId: string, date: string, next: boolean): Promise<void> => {
      const key = `${elementId}:${date}`;

      return new Promise<void>((resolve, reject) => {
        const existing = pendingRef.current.get(key);
        const baseline = existing ? existing.baseline : !next;
        if (existing) {
          clearTimeout(existing.timer);
          existing.resolve(); // superseded by this newer tap — quiet no-op, no request sent
        }

        const timer = setTimeout(() => {
          pendingRef.current.delete(key);

          if (next === baseline) {
            // Net change across the whole burst is zero — nothing to persist.
            resolve();
            return;
          }

          void (async () => {
            try {
              const res = await fetch(`/api/dog/${dogId}/logs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ elementId, trainedOn: date }),
              });
              if (res.status === 401) {
                window.location.href = "/auth/signin";
                return;
              }
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(data.error ?? "Failed to save");
              }
              resolve();
            } catch (err) {
              reject(err instanceof Error ? err : new Error("Failed to save"));
            }
          })();
        }, DEBOUNCE_MS);

        pendingRef.current.set(key, { timer, baseline, resolve });
      });
    },
    [dogId],
  );

  return toggleTick;
}
