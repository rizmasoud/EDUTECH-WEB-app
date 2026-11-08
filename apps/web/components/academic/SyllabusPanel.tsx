'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, type BookItem, type SyllabusDetail, type SyllabusItem } from '../../lib/api-client';
import { createLatestRequestGuard } from '../../lib/attendance-session-utils';
import {
  buildCreateSyllabusPayload,
  describeSyllabusError,
  endSentence,
  pickBookSyllabus,
  planItemMove,
  shouldRefreshItemsAfterReorder,
  sortSyllabusItems,
  validateItemForm,
  type ItemFormValues,
} from '../../lib/syllabus-utils';
import { useNotifications } from '../ui/NotificationProvider';
import { SyllabusPanelView, type ItemDialogState } from './SyllabusPanelView';

interface SyllabusPanelProps {
  book: BookItem;
  isSupervisor: boolean;
}

/**
 * Supervisor management of a book's ONE canonical syllabus and its items. The Book is the only scope: parts and
 * segments are never loaded, shown or sent.
 *
 * Error placement (same split as BooksManager/ClassesManager):
 *  - syllabus load failure     -> `loadError`, with a retry
 *  - item load failure         -> `itemsError` inside the syllabus
 *  - save failure in a dialog  -> shown INSIDE that dialog (`itemDialog.error`)
 *  - create / reorder failure  -> `actionError`, above content that stays visible
 * The API is the authority for validation; its messages are shown unchanged.
 *
 * There is intentionally no delete: see SYLLABUS_ITEM_DELETE_POLICY.
 */
export function SyllabusPanel({ book, isSupervisor }: SyllabusPanelProps) {
  const notifier = useNotifications();
  // One guard per kind of request, so only the newest response of each may update state.
  const [syllabusGuard] = useState(() => createLatestRequestGuard());
  const [itemsGuard] = useState(() => createLatestRequestGuard());

  const [syllabus, setSyllabus] = useState<SyllabusDetail | null>(null);
  const [loading, setLoading] = useState(isSupervisor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<SyllabusItem[] | undefined>(undefined);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [itemDialog, setItemDialog] = useState<ItemDialogState | null>(null);
  // Mirrors the open syllabus id for async code, whose closures would otherwise see a stale value.
  const syllabusIdRef = useRef<string | null>(null);

  const loadItems = useCallback(
    async (syllabusId: string) => {
      const token = itemsGuard.begin();
      setItemsLoading(true);
      setItemsError(null);
      try {
        const detail = await apiClient.getSyllabus(syllabusId);
        if (!itemsGuard.isLatest(token)) return;
        setItems(sortSyllabusItems(detail.items ?? []));
      } catch (err) {
        if (!itemsGuard.isLatest(token)) return;
        setItemsError(describeSyllabusError(err, 'Failed to load syllabus items'));
      } finally {
        if (itemsGuard.isLatest(token)) setItemsLoading(false);
      }
    },
    [itemsGuard],
  );

  // The book's one syllabus, then its items. Lookup is by book id only.
  const loadSyllabus = useCallback(async () => {
    const token = syllabusGuard.begin();
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiClient.getSyllabi({ bookId: book.id });
      if (!syllabusGuard.isLatest(token)) return;
      const found = pickBookSyllabus(list, book.id);
      syllabusIdRef.current = found?.id ?? null;
      setSyllabus(found);
      setItems(undefined);
      if (found) void loadItems(found.id);
    } catch (err) {
      if (!syllabusGuard.isLatest(token)) return;
      setLoadError(describeSyllabusError(err, 'Failed to load syllabus'));
    } finally {
      if (syllabusGuard.isLatest(token)) setLoading(false);
    }
  }, [book.id, syllabusGuard, loadItems]);

  useEffect(() => {
    if (!isSupervisor) return;
    void loadSyllabus();
    return () => {
      syllabusGuard.invalidate();
      itemsGuard.invalidate();
    };
  }, [isSupervisor, loadSyllabus, syllabusGuard, itemsGuard]);

  const handleCreate = async () => {
    if (creating || syllabus) return;
    const create = buildCreateSyllabusPayload(book.id);
    if (!create.ok) {
      setActionError(create.error);
      return;
    }
    setCreating(true);
    setActionError(null);
    try {
      await apiClient.createSyllabus(create.data);
      notifier.success(`Syllabus created for "${book.name}".`);
      await loadSyllabus();
    } catch (err) {
      setActionError(describeSyllabusError(err, 'Failed to create syllabus'));
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitItem = async (values: ItemFormValues) => {
    const dialog = itemDialog;
    if (!dialog || dialog.saving) return;
    const result = validateItemForm(values, items ?? [], dialog.item);
    if (!result.ok) {
      setItemDialog({ ...dialog, error: result.error });
      return;
    }

    setItemDialog({ ...dialog, saving: true, error: null });
    try {
      if (dialog.item) {
        await apiClient.updateSyllabusItem(dialog.item.id, result.data);
        notifier.success(`Item "${result.data.title}" updated.`);
      } else {
        await apiClient.addSyllabusItem(dialog.syllabusId, result.data);
        notifier.success(`Item "${result.data.title}" added.`);
      }
      setItemDialog(null);
      await loadItems(dialog.syllabusId);
    } catch (err) {
      const error = describeSyllabusError(err, 'Failed to save syllabus item');
      setItemDialog((cur) => (cur ? { ...cur, saving: false, error } : cur));
    }
  };

  const handleMoveItem = async (syllabusId: string, itemId: string, direction: 'up' | 'down') => {
    if (reordering) return;
    const steps = planItemMove(items ?? [], itemId, direction);
    if (!steps) return;
    setReordering(true);
    setActionError(null);
    try {
      // No bulk reorder endpoint: one PATCH at a time, so a mid-way failure can leave a partial order.
      for (const step of steps) {
        await apiClient.updateSyllabusItem(step.itemId, { sequenceOrder: step.sequenceOrder });
      }
      notifier.success('Item order updated.');
    } catch (err) {
      setActionError(
        `${endSentence(describeSyllabusError(err, 'Failed to reorder items'))} The order may be partly changed; the list was refreshed.`,
      );
    } finally {
      // Reload the real order, but only if this syllabus is still the one shown.
      if (shouldRefreshItemsAfterReorder(syllabusIdRef.current, syllabusId)) {
        await loadItems(syllabusId);
      }
      setReordering(false);
    }
  };

  return (
    <SyllabusPanelView
      isSupervisor={isSupervisor}
      bookName={book.name}
      loading={loading}
      loadError={loadError}
      actionError={actionError}
      syllabus={syllabus}
      creating={creating}
      items={items}
      itemsLoading={itemsLoading}
      itemsError={itemsError}
      reordering={reordering}
      itemDialog={itemDialog}
      onRetry={() => void loadSyllabus()}
      onCreate={() => void handleCreate()}
      onAddItem={(syllabusId) => setItemDialog({ syllabusId, error: null, saving: false })}
      onEditItem={(syllabusId, item) => setItemDialog({ syllabusId, item, error: null, saving: false })}
      onSubmitItem={(values) => void handleSubmitItem(values)}
      onCloseItem={() => setItemDialog((cur) => (cur?.saving ? cur : null))}
      onMoveItem={(syllabusId, itemId, direction) => void handleMoveItem(syllabusId, itemId, direction)}
      onDismissActionError={() => setActionError(null)}
    />
  );
}
