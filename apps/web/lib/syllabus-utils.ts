/**
 * Pure helpers for the Supervisor syllabus management UI.
 * Kept free of React so the behaviour can be unit tested directly (see tests/unit/syllabus-utils.spec.ts).
 *
 * Request validation reuses the shared Zod contracts (packages/shared) instead of redefining them; the API
 * remains the authority and its messages are shown as-is.
 */
import {
  CreateSyllabusItemSchema,
  CreateSyllabusSchema,
  SyllabusItemType,
  UpdateSyllabusItemSchema,
  UpdateSyllabusSchema,
} from '@edutech/shared';
import type { CreateSyllabusDto, CreateSyllabusItemDto, UpdateSyllabusDto } from '@edutech/shared';
import type { BookPartItem, SyllabusDetail, SyllabusItem } from './api-client';

export const SYLLABUS_ITEM_TYPE_LABEL: Record<SyllabusItemType, string> = {
  FILM: 'Film',
  WORKBOOK: 'Workbook',
  CONVERSATION: 'Conversation',
  GRAMMAR: 'Grammar',
  VOCABULARY: 'Vocabulary',
  OTHER: 'Other',
};

export const SYLLABUS_ITEM_TYPES = Object.values(SyllabusItemType) as SyllabusItemType[];

/**
 * Data-safety rule: a syllabus item may have been copied into a Lesson Plan, and the API gives the UI no way to
 * tell (no usage field on the item, no "which plans use this item" endpoint; Lesson Plans are only reachable
 * per class). Deleting would silently detach historical plan items, so the UI offers no delete at all.
 * Revisit once the API exposes item usage.
 */
export const SYLLABUS_ITEM_DELETE_POLICY = {
  available: false,
  reason:
    'Deleting syllabus items is turned off: the system cannot yet tell whether an item has been used in a Lesson Plan.',
} as const;

export const NO_CHANGES_MESSAGE = 'No changes to save.';

/** Each scope (a book part, or the whole book when it has no parts) has exactly one syllabus; the API rejects a second. */
export const DUPLICATE_PART_MESSAGE = 'This book part already has a syllabus. Each part has exactly one syllabus.';
export const DUPLICATE_WHOLE_BOOK_MESSAGE = 'This book already has a whole-book syllabus.';
export const PART_REQUIRED_MESSAGE =
  'Choose the book part this syllabus belongs to. A book with parts has one syllabus per part, never a whole-book syllabus.';
export const PART_NOT_APPLICABLE_MESSAGE = 'This book has no parts, so its syllabus covers the whole book.';

/** Value of the scope selector that means "the whole book" (only for a book without parts). */
export const WHOLE_BOOK_VALUE = '';

export function sortSyllabusItems<T extends { sequenceOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
}

/** The next free order number: one after the highest in use (1 for an empty syllabus). */
export function nextSequenceOrder(items: readonly { sequenceOrder: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sequenceOrder), 0) + 1;
}

// ---- scope (book part / whole book) -----------------------------------------------------------------------
//
// A syllabus belongs to a Book Part, or is the single whole-book syllabus of a book that has no Parts.
// Segments are subdivisions inside a Part and are never a syllabus scope, so they are never offered here.

export interface PartOption {
  id: string;
  label: string;
}

/** Part choices for a book, in curriculum order: "Part 1: Name". */
export function buildPartOptions(parts: readonly BookPartItem[]): PartOption[] {
  return sortSyllabusItems(parts).map((part) => ({
    id: part.id,
    label: `Part ${part.sequenceOrder}: ${part.name}`,
  }));
}

/** Legacy data: a syllabus created per segment before segments stopped being a syllabus scope. */
export function isLegacySegmentSyllabus(syllabus: Pick<SyllabusDetail, 'bookSegmentId'>): boolean {
  return Boolean(syllabus.bookSegmentId);
}

export function syllabusScopeLabel(
  syllabus: Pick<SyllabusDetail, 'bookPartId' | 'bookPart' | 'bookSegmentId' | 'bookSegment'>,
): string {
  if (syllabus.bookPartId) {
    const part = syllabus.bookPart;
    return part ? `Part ${part.sequenceOrder}: ${part.name}` : 'Part';
  }
  if (isLegacySegmentSyllabus(syllabus)) {
    return `Legacy segment syllabus: ${syllabus.bookSegment?.name ?? 'Unknown segment'}`;
  }
  return 'Whole book';
}

/** Whole-book syllabus first, then parts in curriculum order, then legacy segment syllabi last. */
export function sortSyllabi(syllabi: readonly SyllabusDetail[]): SyllabusDetail[] {
  const rank = (s: SyllabusDetail) => (s.bookPartId ? 1 : isLegacySegmentSyllabus(s) ? 2 : 0);
  return [...syllabi].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (rank(a) === 1) return (a.bookPart?.sequenceOrder ?? 0) - (b.bookPart?.sequenceOrder ?? 0);
    return (a.bookSegment?.name ?? '').localeCompare(b.bookSegment?.name ?? '');
  });
}

/** True when another syllabus (not `excludeId`) already covers the scope. `partId` null means the whole book. */
export function hasSameScope(
  syllabi: readonly Pick<SyllabusDetail, 'id' | 'bookPartId' | 'bookSegmentId'>[],
  partId: string | null,
  excludeId?: string,
): boolean {
  return syllabi.some(
    (s) =>
      s.id !== excludeId &&
      !isLegacySegmentSyllabus(s) &&
      (s.bookPartId ?? null) === partId,
  );
}

function issuesToMessage(issues: readonly { message: string }[]): string {
  return issues.map((i) => i.message).join(', ');
}

export type ScopeResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Validate the scope of a new syllabus with the shared contract plus the part rule the API enforces (checked here
 * only to answer without a round trip). `hasParts` says whether the book has Parts: then a Part is required and a
 * whole-book syllabus is not allowed; otherwise only the whole book applies. Segments are never sent.
 */
export function buildCreateSyllabusPayload(
  bookId: string,
  partId: string,
  hasParts: boolean,
): ScopeResult<CreateSyllabusDto> {
  if (hasParts && !partId) return { ok: false, error: PART_REQUIRED_MESSAGE };
  if (!hasParts && partId) return { ok: false, error: PART_NOT_APPLICABLE_MESSAGE };
  const parsed = CreateSyllabusSchema.safeParse({ bookId, bookPartId: partId || null });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: issuesToMessage(parsed.error.issues) };
}

/** Moving a syllabus to a Part (also how a legacy segment syllabus is moved to its Part). */
export function buildUpdateSyllabusPayload(
  current: Pick<SyllabusDetail, 'bookPartId' | 'bookSegmentId'>,
  partId: string,
  hasParts: boolean,
): ScopeResult<UpdateSyllabusDto> {
  if (hasParts && !partId) return { ok: false, error: PART_REQUIRED_MESSAGE };
  if (!hasParts && partId) return { ok: false, error: PART_NOT_APPLICABLE_MESSAGE };
  const next = partId || null;
  if ((current.bookPartId ?? null) === next && !isLegacySegmentSyllabus(current)) {
    return { ok: false, error: NO_CHANGES_MESSAGE };
  }
  const parsed = UpdateSyllabusSchema.safeParse({ bookPartId: next });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: issuesToMessage(parsed.error.issues) };
}

// ---- items ------------------------------------------------------------------------------------------------

export interface ItemFormValues {
  type: SyllabusItemType;
  title: string;
  description: string;
  required: boolean;
  /** Kept as text while typing; validated on submit. */
  sequenceOrder: string;
}

export function emptyItemForm(items: readonly { sequenceOrder: number }[]): ItemFormValues {
  return {
    type: SyllabusItemType.OTHER,
    title: '',
    description: '',
    required: true,
    sequenceOrder: String(nextSequenceOrder(items)),
  };
}

export function itemToForm(item: SyllabusItem): ItemFormValues {
  return {
    type: item.type,
    title: item.title,
    description: item.description ?? '',
    required: item.required,
    sequenceOrder: String(item.sequenceOrder),
  };
}

/**
 * Validate the item form against the shared contract, plus the duplicate-order rule the API also enforces
 * (checked here only to answer without a round trip; the API stays authoritative).
 * `editing` is the item being edited; its own order number is not a clash and an unchanged form is rejected.
 */
export function validateItemForm(
  values: ItemFormValues,
  siblings: readonly SyllabusItem[],
  editing?: SyllabusItem,
): ScopeResult<CreateSyllabusItemDto> {
  const orderText = values.sequenceOrder.trim();
  const order = Number(orderText);
  if (orderText === '' || !Number.isInteger(order)) {
    return { ok: false, error: 'Sequence order must be a whole number.' };
  }

  const candidate = {
    type: values.type,
    title: values.title.trim(),
    description: values.description.trim() === '' ? null : values.description.trim(),
    required: values.required,
    sequenceOrder: order,
  };
  const schema = editing ? UpdateSyllabusItemSchema : CreateSyllabusItemSchema;
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) return { ok: false, error: issuesToMessage(parsed.error.issues) };

  if (siblings.some((s) => s.id !== editing?.id && s.sequenceOrder === order)) {
    return { ok: false, error: `Sequence order ${order} is already in use for this syllabus` };
  }

  if (
    editing &&
    editing.type === candidate.type &&
    editing.title === candidate.title &&
    (editing.description ?? null) === candidate.description &&
    editing.required === candidate.required &&
    editing.sequenceOrder === candidate.sequenceOrder
  ) {
    return { ok: false, error: NO_CHANGES_MESSAGE };
  }

  return { ok: true, data: candidate };
}

export interface SequenceStep {
  itemId: string;
  sequenceOrder: number;
}

/**
 * Steps that swap an item with its neighbour. The API rejects two items with the same order number, so a
 * plain swap is impossible: the item first moves to a free number past the end, the neighbour takes its old
 * place, then the item takes the neighbour's. Returns null when the item is already first/last or is unknown.
 * There is no bulk reorder endpoint, so the steps run one request at a time and are not atomic.
 */
export function planItemMove(
  items: readonly SyllabusItem[],
  itemId: string,
  direction: 'up' | 'down',
): SequenceStep[] | null {
  const sorted = sortSyllabusItems(items);
  const index = sorted.findIndex((i) => i.id === itemId);
  if (index < 0) return null;
  const neighbour = sorted[direction === 'up' ? index - 1 : index + 1];
  if (!neighbour) return null;
  const item = sorted[index];
  return [
    { itemId: item.id, sequenceOrder: nextSequenceOrder(sorted) },
    { itemId: neighbour.id, sequenceOrder: item.sequenceOrder },
    { itemId: item.id, sequenceOrder: neighbour.sequenceOrder },
  ];
}

/**
 * After a reorder finishes, reload the items only if that syllabus is still the expanded one. Reloading any other
 * syllabus would start a detail request that invalidates the in-flight request of the syllabus now open (they
 * share one "latest request" guard) and would show a loading state or error for a collapsed syllabus.
 * A collapsed syllabus needs no refresh: expanding it always refetches.
 */
export function shouldRefreshItemsAfterReorder(expandedId: string | null, reorderedId: string): boolean {
  return expandedId === reorderedId;
}

// ---- errors -----------------------------------------------------------------------------------------------

/** Ends the text with a full stop unless it already ends a sentence (backend messages usually have none). */
export function endSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** One readable message for a failed request. Backend validation messages are passed through unchanged. */
export function describeSyllabusError(err: unknown, fallback: string): string {
  const e = (err ?? {}) as { statusCode?: number; message?: string };
  if (e.statusCode === 403) return 'Only Supervisors can change syllabi.';
  if (e.statusCode === 404) {
    return `${endSentence(e.message || 'The syllabus data was not found')} It may have been removed; refresh and try again.`;
  }
  return e.message || fallback;
}
