/**
 * Shared data for the signed-in app: terms, the selected term, and everything scoped to it.
 *
 * Why this is not React state in page.tsx: the previous implementation kept `activeTerm` and `activeProposal`
 * in `useCallback` dependencies of the function that refreshes them. Each refresh produced a new proposal
 * object, which produced a new callback, which re-ran the loading effect, forever. Here a refresh never
 * depends on rendering at all: it reads the current selection from this object and writes one snapshot.
 *
 * Rules enforced here (and covered by tests/unit/app-data-controller.spec.ts):
 *  - The selected term is the single source of truth. Classes are only ever published together with the id
 *    of the term they were loaded for (`classesTermId`), so a screen can tell whether they belong to the
 *    term it is showing.
 *  - Choosing a term clears the previous term's classes and proposals immediately, so they are never shown
 *    under the new term's name, and loads exactly that term's classes and proposals once.
 *  - A response that is no longer current (newer request, term change, reset) is discarded.
 *  - A failed load is kept in `error` until a later load succeeds. Data from a previous successful load of the
 *    SAME term is kept; data that belongs to another term is never kept.
 */

import type { AcademicTerm, ClassItem, Schedule, SchedulingProposal } from './api-client';

export interface AppDataApi {
  getAcademicTerms(): Promise<AcademicTerm[]>;
  getClasses(filter: { academicTermId?: string }): Promise<ClassItem[]>;
  getSchedules(): Promise<Schedule[]>;
  getProposals(filter: { academicTermId?: string }): Promise<SchedulingProposal[]>;
}

export interface AppDataSnapshot {
  terms: AcademicTerm[];
  activeTerm: AcademicTerm | null;
  classes: ClassItem[];
  /** Id of the term `classes` was loaded for; null when there are no classes for the selected term. */
  classesTermId: string | null;
  schedules: Schedule[];
  proposals: SchedulingProposal[];
  activeProposal: SchedulingProposal | null;
  /** A request is in flight. */
  loading: boolean;
  /** The first load attempt has finished (successfully or not). */
  loaded: boolean;
  /** Message of the last failed load; null after a successful load. */
  error: string | null;
}

const INITIAL: AppDataSnapshot = {
  terms: [],
  activeTerm: null,
  classes: [],
  classesTermId: null,
  schedules: [],
  proposals: [],
  activeProposal: null,
  loading: false,
  loaded: false,
  error: null,
};

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as Error).message === 'string') {
    return (err as Error).message || 'Unknown error';
  }
  return 'Unknown error';
}

/** True when the loaded classes belong to the selected term (so they may be shown for it). */
export function classesMatchTerm(snapshot: Pick<AppDataSnapshot, 'activeTerm' | 'classesTermId'>): boolean {
  return snapshot.activeTerm !== null && snapshot.classesTermId === snapshot.activeTerm.id;
}

export class AppDataController {
  private state: AppDataSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  /** Incremented by every load/reset; a response only applies if it still holds the latest value. */
  private generation = 0;

  /** Only a supervisor may call the proposals endpoint (a teacher would get 403). */
  private supervisor: boolean;

  constructor(
    private readonly api: AppDataApi,
    options: { isSupervisor?: boolean } = {},
  ) {
    this.supervisor = options.isSupervisor ?? false;
  }

  /** Set the signed-in user's role before the first load. Does not trigger a request. */
  setSupervisor(isSupervisor: boolean): void {
    this.supervisor = isSupervisor;
  }

  // useSyncExternalStore contract
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): AppDataSnapshot => this.state;

  private set(patch: Partial<AppDataSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Forget everything (sign-out). In-flight responses are discarded. */
  reset(): void {
    this.generation += 1;
    this.set({ ...INITIAL });
  }

  /** Select a proposal for review (or clear it). Never triggers a request. */
  setActiveProposal(proposal: SchedulingProposal | null): void {
    this.set({ activeProposal: proposal });
  }

  private proposalsFor(termId: string | undefined): Promise<SchedulingProposal[]> {
    // The proposals endpoint is supervisor-only; a teacher would get 403.
    return this.supervisor
      ? this.api.getProposals({ academicTermId: termId })
      : Promise.resolve([]);
  }

  /**
   * Reload terms, the selected term's classes and proposals, and schedules.
   * Keeps the current selection when that term still exists; otherwise picks the active (or first) term.
   */
  async refresh(): Promise<void> {
    const generation = ++this.generation;
    this.set({ loading: true });
    try {
      const terms = await this.api.getAcademicTerms();
      const currentId = this.state.activeTerm?.id;
      const chosen =
        terms.find((t) => t.id === currentId) ?? terms.find((t) => t.status === 'ACTIVE') ?? terms[0] ?? null;

      const [classes, schedules, proposals] = await Promise.all([
        this.api.getClasses({ academicTermId: chosen?.id }),
        this.api.getSchedules(),
        this.proposalsFor(chosen?.id),
      ]);
      if (generation !== this.generation) return;

      const open = this.state.activeProposal;
      const fresh = open ? proposals.find((p) => p.id === open.id) : undefined;
      this.set({
        terms,
        activeTerm: chosen,
        classes,
        classesTermId: chosen?.id ?? null,
        schedules,
        proposals,
        // Keep the proposal under review up to date; keep it as-is if the list no longer contains it.
        activeProposal: fresh ?? open,
        loading: false,
        loaded: true,
        error: null,
      });
    } catch (err) {
      if (generation !== this.generation) return;
      // Nothing was replaced: whatever is on screen is what the last successful load of this term produced.
      this.set({ loading: false, loaded: true, error: messageOf(err) });
    }
  }

  /** Select a term and load exactly its classes and proposals (no terms or schedules reload). */
  async selectTerm(term: AcademicTerm): Promise<void> {
    if (this.state.activeTerm?.id === term.id && this.state.classesTermId === term.id && !this.state.error) {
      return;
    }
    const generation = ++this.generation;
    // The previous term's data must not be shown under the new term's name.
    this.set({
      activeTerm: term,
      classes: [],
      classesTermId: null,
      proposals: [],
      activeProposal: null,
      loading: true,
      error: null,
    });
    try {
      const [classes, proposals] = await Promise.all([
        this.api.getClasses({ academicTermId: term.id }),
        this.proposalsFor(term.id),
      ]);
      if (generation !== this.generation) return;
      this.set({
        classes,
        classesTermId: term.id,
        proposals,
        activeProposal: proposals[0] ?? null,
        loading: false,
        loaded: true,
        error: null,
      });
    } catch (err) {
      if (generation !== this.generation) return;
      this.set({ loading: false, loaded: true, error: messageOf(err) });
    }
  }
}
