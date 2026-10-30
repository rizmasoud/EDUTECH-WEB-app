/**
 * Notification store behind the app-wide toasts (see components/ui/NotificationProvider.tsx).
 *
 * Plain TypeScript with injectable timers, like AppDataController, so every rule below is unit-tested without a DOM.
 *
 * Rules:
 *  - Every notification gets its own id from a counter. Two notifications with identical text are two
 *    notifications: each has its own timer and dismissing one never touches the other. (The previous ad-hoc
 *    mechanism in page.tsx dismissed "whichever notification currently has this message", so an older timer could
 *    close a newer, identical message early.)
 *  - Success and info notifications dismiss themselves after DEFAULT_AUTO_DISMISS_MS. Errors never do by default:
 *    they stay until the user dismisses them. A caller can opt in to a timeout with `durationMs`.
 *  - `pause` stops a notification's timer and remembers the time left; `resume` restarts it with that time (used
 *    while the pointer is over a notification or keyboard focus is inside it).
 *  - Timers never outlive their notification: dismissing, trimming and `dispose` all clear them.
 *  - The list is bounded so a burst cannot grow without limit. Past MAX_VISIBLE, the oldest success/info
 *    notification is dropped first; errors are only dropped when nothing else is left to drop, and only past
 *    HARD_CAP. The notification being added is never the one dropped.
 */

export type NotificationType = 'success' | 'error' | 'info';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
}

export interface NotifyOptions {
  /** Auto-dismiss delay in ms; `null` keeps the notification until it is dismissed. Defaults by type. */
  durationMs?: number | null;
}

/** Timer functions the store uses; replaced in tests. */
export interface NotificationClock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const DEFAULT_AUTO_DISMISS_MS = 5000;
export const MAX_VISIBLE = 5;
export const HARD_CAP = 10;

const SYSTEM_CLOCK: NotificationClock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

interface Timing {
  /** Total delay still to run when the timer is (re)started. */
  remainingMs: number;
  handle: unknown | null;
  startedAt: number;
}

export class NotificationStore {
  private items: readonly NotificationItem[] = [];
  private readonly timings = new Map<string, Timing>();
  private readonly listeners = new Set<() => void>();
  private counter = 0;

  constructor(private readonly clock: NotificationClock = SYSTEM_CLOCK) {}

  // useSyncExternalStore contract
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly NotificationItem[] => this.items;

  private emit(next: readonly NotificationItem[]): void {
    this.items = next;
    this.listeners.forEach((l) => l());
  }

  /** Add a notification and return its id. */
  notify(type: NotificationType, message: string, options: NotifyOptions = {}): string {
    this.counter += 1;
    const id = `notification-${this.counter}`;
    const durationMs =
      options.durationMs !== undefined ? options.durationMs : type === 'error' ? null : DEFAULT_AUTO_DISMISS_MS;

    this.emit([...this.items, { id, type, message }]);
    if (durationMs !== null && durationMs >= 0) {
      this.timings.set(id, { remainingMs: durationMs, handle: null, startedAt: 0 });
      this.start(id);
    }
    this.trim(id);
    return id;
  }

  /** Remove one notification (and its timer). Unknown ids are ignored. */
  dismiss(id: string): void {
    if (!this.items.some((n) => n.id === id)) return;
    this.clearTiming(id);
    this.emit(this.items.filter((n) => n.id !== id));
  }

  /** Stop the countdown, keeping the time that is left. No effect on a notification without a timer. */
  pause(id: string): void {
    const timing = this.timings.get(id);
    if (!timing || timing.handle === null) return;
    this.clock.clearTimeout(timing.handle);
    timing.remainingMs = Math.max(0, timing.remainingMs - (this.clock.now() - timing.startedAt));
    timing.handle = null;
  }

  /** Restart a paused countdown with the time that was left. */
  resume(id: string): void {
    const timing = this.timings.get(id);
    if (!timing || timing.handle !== null) return;
    this.start(id);
  }

  /** Clear every timer and every notification. The store stays usable afterwards (React StrictMode remounts). */
  dispose(): void {
    for (const id of [...this.timings.keys()]) this.clearTiming(id);
    if (this.items.length > 0) this.emit([]);
  }

  private start(id: string): void {
    const timing = this.timings.get(id);
    if (!timing) return;
    timing.startedAt = this.clock.now();
    timing.handle = this.clock.setTimeout(() => this.dismiss(id), timing.remainingMs);
  }

  private clearTiming(id: string): void {
    const timing = this.timings.get(id);
    if (!timing) return;
    if (timing.handle !== null) this.clock.clearTimeout(timing.handle);
    this.timings.delete(id);
  }

  /** Bound the list. The notification that was just added (`keepId`) is never the one dropped. */
  private trim(keepId: string): void {
    let items = this.items;
    while (items.length > MAX_VISIBLE) {
      const transient = items.find((n) => n.type !== 'error' && n.id !== keepId);
      if (transient) {
        this.clearTiming(transient.id);
        items = items.filter((n) => n.id !== transient.id);
      } else if (items.length > HARD_CAP) {
        const oldest = items.find((n) => n.id !== keepId)!;
        this.clearTiming(oldest.id);
        items = items.filter((n) => n.id !== oldest.id);
      } else {
        break;
      }
    }
    if (items !== this.items) this.emit(items);
  }
}
