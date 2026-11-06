'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiClient, type BookItem, type SyllabusDetail, type SyllabusItem } from '../../lib/api-client';
import { createLatestRequestGuard } from '../../lib/attendance-session-utils';
import {
  buildCreateSyllabusPayload,
  buildSegmentOptions,
  buildUpdateSyllabusPayload,
  describeSyllabusError,
  endSentence,
  planItemMove,
  sortSyllabi,
  sortSyllabusItems,
  validateItemForm,
  type ItemFormValues,
  type SegmentOption,
} from '../../lib/syllabus-utils';
import { useNotifications } from '../ui/NotificationProvider';
import { SyllabusPanelView, type ItemDialogState, type ScopeDialogState } from './SyllabusPanelView';

interface SyllabusPanelProps {
  book: BookItem;
  isSupervisor: boolean;
}

/**
 * Supervisor syllabus management for one book: syllabi per book/segment, their items, and item order.
 *
 * Error placement (same split as BooksManager/ClassesManager):
 *  - list/segment load failure  -> `loadError`, with a retry
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

  const [syllabi, setSyllabi] = useState<SyllabusDetail[]>([]);
  const [segmentOptions, setSegmentOptions] = useState<SegmentOption[]>([]);
  const [loading, setLoading] = useState(isSupervisor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
      const [list, parts] = await Promise.all([
        apiClient.getSyllabi({ bookId: book.id }),
        apiClient.getBookParts(book.id),
      ]);
      const segments = await Promise.all(parts.map((part) => apiClient.getBookSegments(part.id)));
      if (!listGuard.isLatest(token)) return;
      const segmentsByPart = Object.fromEntries(parts.map((part, i) => [part.id, segments[i]]));
      setSyllabi(sortSyllabi(list));
      setSegmentOptions(buildSegmentOptions(parts, segmentsByPart));
    } catch (err) {
      if (!listGuard.isLatest(token)) return;
      setLoadError(describeSyllabusError(err, 'Failed to load syllabi'));
    } finally {
      if (listGuard.isLatest(token)) setLoading(false);
    }
  }, [book.id, listGuard]);

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
    return () => {
      listGuard.invalidate();
      detailGuard.invalidate();
    };
  }, [isSupervisor, loadSyllabi, listGuard, detailGuard]);

  const handleToggle = (syllabusId: string) => {
    setActionError(null);
    setDetailError(null);
    if (expandedId === syllabusId) {
      detailGuard.invalidate();
      setDetailLoadingId(null);
      setExpandedId(null);
      return;
    }
    setExpandedId(syllabusId);
    void loadItems(syllabusId); // always refetch: another Supervisor may have changed the items
  };

  const handleSubmitScope = async (segmentId: string) => {
    const dialog = scopeDialog;
    if (!dialog || dialog.saving) return;
    const fail = (error: string) => setScopeDialog((cur) => (cur ? { ...cur, saving: false, error } : cur));

    const editing = dialog.mode === 'edit' && dialog.syllabus ? dialog.syllabus : null;
    const create = editing ? null : buildCreateSyllabusPayload(book.id, segmentId);
    const update = editing ? buildUpdateSyllabusPayload(editing, segmentId) : null;
    const invalid = create && !create.ok ? create.error : update && !update.ok ? update.error : null;
    if (invalid) {
      fail(invalid);
      return;
    }

    setScopeDialog({ ...dialog, saving: true, error: null });
    try {
      if (editing && update?.ok) {
        await apiClient.updateSyllabus(editing.id, update.data);
        notifier.success('Syllabus scope updated.');
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
      await loadItems(syllabusId);
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
      segmentOptions={segmentOptions}
      expandedId={expandedId}
      itemsBySyllabus={itemsBySyllabus}
      detailLoadingId={detailLoadingId}
      detailError={detailError}
      reordering={reordering}
      scopeDialog={scopeDialog}
      itemDialog={itemDialog}
      onRetry={() => void loadSyllabi()}
      onToggle={handleToggle}
      onNewSyllabus={() => setScopeDialog({ mode: 'create', error: null, saving: false })}
      onEditSyllabus={(syllabus) => setScopeDialog({ mode: 'edit', syllabus, error: null, saving: false })}
      onSubmitScope={(segmentId) => void handleSubmitScope(segmentId)}
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
