import React, { useId, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardList, Edit2, Info, Plus, RefreshCw, X } from 'lucide-react';
import type { SyllabusDetail, SyllabusItem } from '../../lib/api-client';
import { InlineError } from '../ui/InlineError';
import {
  SYLLABUS_ITEM_DELETE_POLICY,
  SYLLABUS_ITEM_TYPES,
  SYLLABUS_ITEM_TYPE_LABEL,
  emptyItemForm,
  itemToForm,
  sortSyllabusItems,
  type ItemFormValues,
} from '../../lib/syllabus-utils';

/**
 * Presentation of the Supervisor syllabus panel inside an expanded book (BooksManager). It owns no data fetching:
 * SyllabusPanel (the container) loads and saves, this file renders every state (loading, error, empty, list,
 * dialogs) from props so each state can be rendered and tested on its own.
 *
 * Supervisor-only: renders nothing for any other role.
 */

export interface ItemDialogState {
  syllabusId: string;
  item?: SyllabusItem;
  error: string | null;
  saving: boolean;
}

export interface SyllabusPanelViewProps {
  isSupervisor: boolean;
  bookName: string;
  loading: boolean;
  loadError: string | null;
  /** Failure of a create or reorder; shown above the content, which stays visible. */
  actionError: string | null;
  /** The book's one canonical syllabus, or null when it has none yet. */
  syllabus: SyllabusDetail | null;
  creating: boolean;
  /** Items of `syllabus`; undefined until loaded. */
  items: SyllabusItem[] | undefined;
  itemsLoading: boolean;
  itemsError: string | null;
  reordering: boolean;
  itemDialog: ItemDialogState | null;
  onRetry: () => void;
  onCreate: () => void;
  onAddItem: (syllabusId: string) => void;
  onEditItem: (syllabusId: string, item: SyllabusItem) => void;
  onSubmitItem: (values: ItemFormValues) => void;
  onCloseItem: () => void;
  onMoveItem: (syllabusId: string, itemId: string, direction: 'up' | 'down') => void;
  onDismissActionError: () => void;
}

const FIELD =
  'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500';

export function SyllabusPanelView(props: SyllabusPanelViewProps) {
  const {
    isSupervisor,
    bookName,
    loading,
    loadError,
    actionError,
    syllabus,
    creating,
    items,
    itemsLoading,
    itemsError,
    reordering,
    itemDialog,
  } = props;

  if (!isSupervisor) return null;

  return (
    <section aria-label="Syllabus" className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
        <div className="min-w-0">
          <span className="flex items-center gap-1 font-semibold text-slate-300">
            <ClipboardList className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <span>Syllabus</span>
            <span dir="auto" className="truncate text-slate-400">
              &mdash; {bookName}
            </span>
          </span>
          <p className="mt-0.5 text-[10px] text-slate-500">
            The expected teaching activities for the whole book. Each book has exactly one syllabus.
          </p>
        </div>
        {!loading && !loadError && !syllabus ? (
          <button
            type="button"
            onClick={props.onCreate}
            disabled={creating}
            className="flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-indigo-300 transition hover:bg-slate-700 disabled:opacity-50"
          >
            {creating ? (
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-3 w-3" aria-hidden="true" />
            )}
            <span>Create Syllabus</span>
          </button>
        ) : null}
      </div>

      {actionError ? <InlineError message={actionError} onDismiss={props.onDismissActionError} /> : null}

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 p-4 text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" aria-hidden="true" />
          <span>Loading syllabus...</span>
        </div>
      ) : loadError ? (
        <div className="space-y-2">
          <InlineError message={loadError} />
          <button
            type="button"
            onClick={props.onRetry}
            className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
          >
            Try again
          </button>
        </div>
      ) : !syllabus ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-center text-slate-500">
          <p className="font-semibold text-slate-400">No syllabus yet</p>
          <p className="mt-1 text-[11px]">Create the syllabus for this book, then add its learning items.</p>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-slate-400">
              Learning items
              {items ? (
                <span className="ml-1.5 font-normal text-slate-500">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => props.onAddItem(syllabus.id)}
              disabled={!items}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-indigo-300 hover:bg-slate-700 disabled:opacity-50"
            >
              <Plus className="h-2.5 w-2.5" aria-hidden="true" />
              <span>Add Item</span>
            </button>
          </div>

          {itemsError ? (
            <div className="space-y-2">
              <InlineError message={itemsError} />
            </div>
          ) : null}

          {!items && itemsLoading ? (
            <div role="status" className="flex items-center gap-2 p-2 text-slate-400">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-400" aria-hidden="true" />
              <span>Loading items...</span>
            </div>
          ) : items && items.length === 0 ? (
            <p className="rounded border border-slate-800 bg-slate-900/40 p-3 text-center text-slate-500">
              This syllabus has no items yet.
            </p>
          ) : items ? (
            <ol className="space-y-1.5">
              {sortSyllabusItems(items).map((item, index, sorted) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-2 rounded border border-slate-800 bg-slate-950 p-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] text-slate-500">#{item.sequenceOrder}</span>
                      <span dir="auto" className="break-words font-medium text-slate-200">
                        {item.title}
                      </span>
                      <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400">
                        {SYLLABUS_ITEM_TYPE_LABEL[item.type] ?? item.type}
                      </span>
                      <span className="text-[10px] text-slate-500">{item.required ? 'Required' : 'Optional'}</span>
                    </div>
                    {item.description ? (
                      <p dir="auto" className="mt-0.5 break-words text-[11px] text-slate-400">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => props.onMoveItem(syllabus.id, item.id, 'up')}
                      disabled={reordering || index === 0}
                      aria-label={`Move ${item.title} up`}
                      title="Move up"
                      className="rounded bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onMoveItem(syllabus.id, item.id, 'down')}
                      disabled={reordering || index === sorted.length - 1}
                      aria-label={`Move ${item.title} down`}
                      title="Move down"
                      className="rounded bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      <ArrowDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onEditItem(syllabus.id, item)}
                      disabled={reordering}
                      aria-label={`Edit ${item.title}`}
                      title="Edit item"
                      className="rounded bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      <Edit2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {!SYLLABUS_ITEM_DELETE_POLICY.available ? (
            <p role="note" className="flex items-start gap-1 text-[10px] text-slate-500">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{SYLLABUS_ITEM_DELETE_POLICY.reason}</span>
            </p>
          ) : null}
        </div>
      )}

      {itemDialog ? (
        <SyllabusItemDialog
          key={itemDialog.item?.id ?? `new-${itemDialog.syllabusId}`}
          state={itemDialog}
          initialValues={itemDialog.item ? itemToForm(itemDialog.item) : emptyItemForm(items ?? [])}
          onSubmit={props.onSubmitItem}
          onClose={props.onCloseItem}
        />
      ) : null}
    </section>
  );
}

function DialogShell({
  titleId,
  title,
  subtitle,
  onClose,
  closeDisabled,
  children,
}: {
  titleId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 id={titleId} className="text-base font-bold text-white">
              {title}
            </h3>
            {subtitle ? (
              <p dir="auto" className="mt-0.5 text-xs text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-white disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogActions({
  onClose,
  saving,
  submitLabel,
}: {
  onClose: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        <span>{submitLabel}</span>
      </button>
    </div>
  );
}

function SyllabusItemDialog({
  state,
  initialValues,
  onSubmit,
  onClose,
}: {
  state: ItemDialogState;
  initialValues: ItemFormValues;
  onSubmit: (values: ItemFormValues) => void;
  onClose: () => void;
}) {
  const id = useId();
  const editing = Boolean(state.item);
  const [values, setValues] = useState<ItemFormValues>(initialValues);
  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <DialogShell
      titleId={`${id}-title`}
      title={editing ? 'Edit Syllabus Item' : 'Add Syllabus Item'}
      onClose={onClose}
      closeDisabled={state.saving}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(values);
        }}
        className="space-y-4 text-xs"
      >
        <InlineError message={state.error} />
        <div>
          <label htmlFor={`${id}-title-input`} className="mb-1 block font-semibold text-slate-300">
            Title *
          </label>
          <input
            id={`${id}-title-input`}
            type="text"
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            maxLength={255}
            aria-required="true"
            placeholder="e.g. Unit 1 vocabulary list"
            className={FIELD}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-type`} className="mb-1 block font-semibold text-slate-300">
              Type *
            </label>
            <select
              id={`${id}-type`}
              value={values.type}
              onChange={(e) => set('type', e.target.value as ItemFormValues['type'])}
              className={FIELD}
            >
              {SYLLABUS_ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SYLLABUS_ITEM_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-order`} className="mb-1 block font-semibold text-slate-300">
              Sequence Order *
            </label>
            <input
              id={`${id}-order`}
              type="number"
              min={1}
              step={1}
              value={values.sequenceOrder}
              onChange={(e) => set('sequenceOrder', e.target.value)}
              aria-required="true"
              aria-describedby={`${id}-order-hint`}
              className={FIELD}
            />
          </div>
        </div>
        <p id={`${id}-order-hint`} className="-mt-2 text-[10px] text-slate-500">
          Each item needs its own order number within the syllabus.
        </p>
        <div>
          <label htmlFor={`${id}-description`} className="mb-1 block font-semibold text-slate-300">
            Description
          </label>
          <textarea
            id={`${id}-description`}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className={FIELD}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-required`}
            type="checkbox"
            checked={values.required}
            onChange={(e) => set('required', e.target.checked)}
            className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
          />
          <label htmlFor={`${id}-required`} className="cursor-pointer text-slate-300">
            Required item
          </label>
        </div>
        <DialogActions onClose={onClose} saving={state.saving} submitLabel={editing ? 'Save Item' : 'Add Item'} />
      </form>
    </DialogShell>
  );
}
