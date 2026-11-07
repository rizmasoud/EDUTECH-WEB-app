'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, type BookItem, type SyllabusDetail, type SyllabusItem } from '../../lib/api-client';
import { createLatestRequestGuard } from '../../lib/attendance-session-utils';
import {
  buildCreateSyllabusPayload,
  buildPartOptions,
  buildUpdateSyllabusPayload,
  describeSyllabusError,
  endSentence,
  planItemMove,
  shouldRefreshItemsAfterReorder,
  sortSyllabi,
  sortSyllabusItems,
  validateItemForm,
  type ItemFormValues,
  type PartOption,
} from '../../lib/syllabus-utils';
import { useNotifications } from '../ui/NotificationProvider';
import { SyllabusPanelView, type ItemDialogState, type ScopeDialogState } from './SyllabusPanelView';

interface SyllabusPanelProps {
  book: BookItem;
  isSupervisor: boolean;
}

/**
 * Supervisor syllabus management for one book: one syllabus per book part (or one whole-book syllabus when the
 * book has no parts), their items, and item order. Segments are never a syllabus scope.
 *
 * Error placement (same split as BooksManager/ClassesManager):
 *  - syllabus list load failure -> `loadError`, with a retry
 *  - part choices failure       -> `partError`, a notice with its own retry; it never hides the syllabus list,
 *                                  because syllabi and part choices load independently; new syllabi cannot be
 *                                  created until the parts are known (whether the book has parts decides the scope)
 *  - save failure in a dialog   -> shown INSIDE that dialog (`scopeDialog.error` / `itemDialog.error`)
 *  - reorder failure            -> `actionError`, above a list that stays visible
 * The API is the authority for validation; its messages are shown unchanged.
 *
 * There is intentionally no delete: see SYLLABUS_ITEM_DELETE_POLICY.
 */
export function SyllabusPanel({ book, isSupervisor }: SyllabusPanelProps) {
  const notifier = useNotifications();
  // One guard per kind of request, so only the newest response of each may update state.
  const [listGuard] = useState(() => createLatestRequestGuard());
  const [detailGuard] = useState(() => createLatestRequestGuard());
  const [partGuard] = useState(() => createLatestRequestGuard());

  const [syllabi, setSyllabi] = useState<SyllabusDetail[]>([]);
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  // True once the book's parts have been loaded: only then is it known whether the book has parts.
  const [partsReady, setPartsReady] = useState(false);
  const [partError, setPartError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupervisor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Mirrors `expandedId` for async code, whose closures would otherwise see a stale value (see handleMoveItem).
  const expandedIdRef = useRef<string | null>(null);
  const [itemsBySyllabus, setItemsBySyllabus] = useState<Record<string, SyllabusItem[] | undefined>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [scopeDialog, setScopeDialog] = useState<ScopeDialogState | null>(null);
  const [itemDialog, setItemDialog] = useState<ItemDialogState | null>(null);

  const loadSyllabi = useCallback(async () => {
    const token = listGuard.begin();
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiClient.getSyllabi({ bookId: book.id });
      if (!listGuard.isLatest(token)) return;
      setSyllabi(sortSyllabi(list));
    } catch (err) {
      if (!listGuard.isLatest(token)) return;
      setLoadError(describeSyllabusError(err, 'Failed to load syllabi'));
    } finally {
      if (listGuard.isLatest(token)) setLoading(false);
    }
  }, [book.id, listGuard]);

  // The parts feed the scope selector (and decide whether the book is Part-scoped), so a failure here must not
  // affect the syllabus list. Segments are deliberately not loaded: they are never a syllabus scope.
  const loadPartOptions = useCallback(async () => {
    const token = partGuard.begin();
    setPartError(null);
    setPartsReady(false);
    try {
      const parts = await apiClient.getBookParts(book.id);
      if (!partGuard.isLatest(token)) return;
      setPartOptions(buildPartOptions(parts));
      setPartsReady(true);
    } catch (err) {
      if (!partGuard.isLatest(token)) return;
      setPartOptions([]);
      setPartError(describeSyllabusError(err, 'Failed to load book parts'));
    }
  }, [book.id, partGuard]);

  const loadItems = useCallback(
    async (syllabusId: string) => {
      const token = detailGuard.begin();
      setDetailLoadingId(syllabusId);
      setDetailError(null);
      try {
        const detail = await apiClient.getSyllabus(syllabusId);
        if (!detailGuard.isLatest(token)) return;
        setItemsBySyllabus((prev) => ({ ...prev, [syllabusId]: sortSyllabusItems(detail.items ?? []) }));
      } catch (err) {
        if (!detailGuard.isLatest(token)) return;
        setDetailError(describeSyllabusError(err, 'Failed to load syllabus items'));
      } finally {
        if (detailGuard.isLatest(token)) setDetailLoadingId(null);
      }
    },
    [detailGuard],
  );

  useEffect(() => {
    if (!isSupervisor) return;
    void loadSyllabi();
    void loadPartOptions();
    return () => {
      listGuard.invalidate();
      detailGuard.invalidate();
      partGuard.invalidate();
    };
  }, [isSupervisor, loadSyllabi, loadPartOptions, listGuard, detailGuard, partGuard]);

  const handleToggle = (syllabusId: string) => {
    setActionError(null);
    setDetailError(null);
    if (expandedId === syllabusId) {
      detailGuard.invalidate();
      setDetailLoadingId(null);
      expandedIdRef.current = null;
      setExpandedId(null);
      return;
    }
    expandedIdRef.current = syllabusId;
    setExpandedId(syllabusId);
    void loadItems(syllabusId); // always refetch: another Supervisor may have changed the items
  };

  const handleSubmitScope = async (partId: string) => {
    const dialog = scopeDialog;
    if (!dialog || dialog.saving) return;
    const fail = (error: string) => setScopeDialog((cur) => (cur ? { ...cur, saving: false, error } : cur));
    if (!partsReady) {
      fail('The book parts have not loaded yet, so the scope cannot be checked. Reload the parts and try again.');
      return;
    }
    const hasParts = partOptions.length > 0;

    const editing = dialog.mode === 'edit' && dialog.syllabus ? dialog.syllabus : null;
    const create = editing ? null : buildCreateSyllabusPayload(book.id, partId, hasParts);
    const update = editing ? buildUpdateSyllabusPayload(editing, partId, hasParts) : null;
    const invalid = create && !create.ok ? create.error : update && !update.ok ? update.error : null;
    if (invalid) {
      fail(invalid);
      return;
    }

    setScopeDialog({ ...dialog, saving: true, error: null });
    try {
      if (editing && update?.ok) {
        await apiClient.updateSyllabus(editing.id, update.data);
        notifier.success('Syllabus moved.');
      } else if (create?.ok) {
        await apiClient.createSyllabus(create.data);
        notifier.success(`Syllabus created for "${book.name}".`);
      }
      setScopeDialog(null);
      await loadSyllabi();
    } catch (err) {
      fail(describeSyllabusError(err, 'Failed to save syllabus'));
    }
  };

  const handleSubmitItem = async (values: ItemFormValues) => {
    const dialog = itemDialog;
    if (!dialog || dialog.saving) return;
    const result = validateItemForm(values, itemsBySyllabus[dialog.syllabusId] ?? [], dialog.item);
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
    const steps = planItemMove(itemsBySyllabus[syllabusId] ?? [], itemId, direction);
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
      // Reload the real order, but only if this syllabus is still the open one: loadItems restarts the shared
      // detail guard, so reloading a collapsed syllabus would discard the response for the one now expanded.
      if (shouldRefreshItemsAfterReorder(expandedIdRef.current, syllabusId)) {
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
      syllabi={syllabi}
      partOptions={partOptions}
      partsReady={partsReady}
      partError={partError}
      expandedId={expandedId}
      itemsBySyllabus={itemsBySyllabus}
      detailLoadingId={detailLoadingId}
      detailError={detailError}
      reordering={reordering}
      scopeDialog={scopeDialog}
      itemDialog={itemDialog}
      onRetry={() => void loadSyllabi()}
      onRetryParts={() => void loadPartOptions()}
      onToggle={handleToggle}
      onNewSyllabus={() => setScopeDialog({ mode: 'create', error: null, saving: false })}
      onEditSyllabus={(syllabus) => setScopeDialog({ mode: 'edit', syllabus, error: null, saving: false })}
      onSubmitScope={(partId) => void handleSubmitScope(partId)}
      onCloseScope={() => setScopeDialog((cur) => (cur?.saving ? cur : null))}
      onAddItem={(syllabusId) => setItemDialog({ syllabusId, error: null, saving: false })}
      onEditItem={(syllabusId, item) => setItemDialog({ syllabusId, item, error: null, saving: false })}
      onSubmitItem={(values) => void handleSubmitItem(values)}
      onCloseItem={() => setItemDialog((cur) => (cur?.saving ? cur : null))}
      onMoveItem={(syllabusId, itemId, direction) => void handleMoveItem(syllabusId, itemId, direction)}
      onDismissActionError={() => setActionError(null)}
    />
  );
}
