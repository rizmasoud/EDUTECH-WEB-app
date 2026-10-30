'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { NotificationStore, type NotificationItem, type NotificationType, type NotifyOptions } from '../../lib/notifications';
import { ToastCard } from './Toast';

/**
 * App-wide notifications.
 *
 * Mounted ONCE, in the shared page (apps/web/app/page.tsx, which both layout files render), so every screen and
 * every dialog below it reaches the same store through `useNotifications()`. The viewport is `fixed` with
 * `z-[100]`, above the `z-50` full-screen overlays the dialogs use, so a notification is never hidden by a dialog.
 * Width: `start-4 end-4` pins both edges 1rem inside the screen (so it can never overflow a narrow viewport) and
 * `max-w-sm` caps it; on wide screens it stays at the start edge at the same width as before. No `w-full`: that
 * plus an inset overflows by the inset on mobile.
 *
 * Use it for the RESULT of an action (saved, deleted, failed to delete). Errors that belong to a form stay inline
 * inside that form's dialog; do not also raise them here.
 *
 * Accessibility: the viewport always contains two live regions (they must exist before content is added to be
 * announced reliably). Success/info go to a polite `status` region, errors to an assertive `alert` region. Only
 * additions are announced, and the countdown/pause logic never re-renders a message, so nothing is announced twice.
 */

export interface Notifier {
  notify(type: NotificationType, message: string, options?: NotifyOptions): string;
  success(message: string, options?: NotifyOptions): string;
  info(message: string, options?: NotifyOptions): string;
  /** Persistent by default: stays until the user dismisses it. */
  error(message: string, options?: NotifyOptions): string;
  dismiss(id: string): void;
}

const NotificationContext = createContext<{ store: NotificationStore; notifier: Notifier } | null>(null);

function createNotifier(store: NotificationStore): Notifier {
  return {
    notify: (type, message, options) => store.notify(type, message, options),
    success: (message, options) => store.notify('success', message, options),
    info: (message, options) => store.notify('info', message, options),
    error: (message, options) => store.notify('error', message, options),
    dismiss: (id) => store.dismiss(id),
  };
}

/** The shared notifier. Must be used below a NotificationProvider. */
export function useNotifications(): Notifier {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside a NotificationProvider');
  return ctx.notifier;
}

function NotificationEntry({
  item,
  onDismiss,
  onPause,
  onResume,
}: {
  item: NotificationItem;
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  // The countdown is held while the pointer is over the card or keyboard focus is inside it.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;
  useEffect(() => {
    if (held) onPause(item.id);
    else onResume(item.id);
  }, [held, item.id, onPause, onResume]);

  return (
    <ToastCard
      type={item.type}
      message={item.message}
      onDismiss={() => onDismiss(item.id)}
      dismissLabel={`Close ${item.type} notification`}
      data-notification-id={item.id}
      className="pointer-events-auto"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    />
  );
}

export interface NotificationViewportProps {
  notifications: readonly NotificationItem[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

/** The fixed overlay. Presentational: it only renders the list it is given. */
export function NotificationViewport({ notifications, onDismiss, onPause, onResume }: NotificationViewportProps) {
  const entry = (item: NotificationItem) => (
    <NotificationEntry key={item.id} item={item} onDismiss={onDismiss} onPause={onPause} onResume={onResume} />
  );
  return (
    <div
      data-notification-viewport=""
      className="pointer-events-none fixed bottom-4 start-4 end-4 z-[100] flex max-w-sm flex-col gap-2"
    >
      <div role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions" className="flex flex-col gap-2">
        {notifications.filter((n) => n.type !== 'error').map(entry)}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="false" aria-relevant="additions" className="flex flex-col gap-2">
        {notifications.filter((n) => n.type === 'error').map(entry)}
      </div>
    </div>
  );
}

export function NotificationProvider({ children, store: injected }: { children?: React.ReactNode; store?: NotificationStore }) {
  const [store] = useState(() => injected ?? new NotificationStore());
  const value = useMemo(() => ({ store, notifier: createNotifier(store) }), [store]);
  // Stable callbacks: entries re-run their pause/resume effect when these change.
  const handlers = useMemo(
    () => ({
      onDismiss: (id: string) => store.dismiss(id),
      onPause: (id: string) => store.pause(id),
      onResume: (id: string) => store.resume(id),
    }),
    [store],
  );
  const notifications = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  // Unmounting clears every timer. (The store stays usable, so a StrictMode remount is harmless.)
  useEffect(() => () => store.dispose(), [store]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationViewport notifications={notifications} {...handlers} />
    </NotificationContext.Provider>
  );
}
