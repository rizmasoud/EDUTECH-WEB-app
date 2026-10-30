'use client';

import React, { useState, useEffect } from 'react';
import { apiClient, BookItem, BookPartItem, BookSegmentItem } from '../../lib/api-client';
import { useNotifications } from '../ui/NotificationProvider';
import { InlineError } from '../ui/InlineError';
import {
  BookOpen,
  Plus,
  Edit2,
  ChevronRight,
  ChevronDown,
  Layers,
  AlertCircle,
  RefreshCw,
  X,
  Bookmark,
  Hash,
} from 'lucide-react';

interface BooksManagerProps {
  isSupervisor?: boolean;
}

export function BooksManager({ isSupervisor = true }: BooksManagerProps) {
  const [books, setBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Errors of an open dialog (book, part or segment: only one is open at a time) live inside it; `error` is only the
  // list-load failure.
  const [formError, setFormError] = useState<string | null>(null);
  const notifier = useNotifications();

  // Expanded hierarchy states
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [bookParts, setBookParts] = useState<Record<string, BookPartItem[]>>({});
  const [expandedPartId, setExpandedPartId] = useState<string | null>(null);
  const [partSegments, setPartSegments] = useState<Record<string, BookSegmentItem[]>>({});

  // Modals
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookItem | null>(null);
  const [isPartModalOpen, setIsPartModalOpen] = useState(false);
  const [selectedBookForPart, setSelectedBookForPart] = useState<BookItem | null>(null);
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [selectedPartForSegment, setSelectedPartForSegment] = useState<BookPartItem | null>(null);

  // Form states - Book
  const [bookName, setBookName] = useState('');
  const [bookLevel, setBookLevel] = useState('');
  const [bookSeqOrder, setBookSeqOrder] = useState(1);
  const [bookSessionCount, setBookSessionCount] = useState(20);
  const [bookIsTerminal, setBookIsTerminal] = useState(false);

  // Form states - Part & Segment
  const [partName, setPartName] = useState('');
  const [partSeqOrder, setPartSeqOrder] = useState(1);
  const [segmentName, setSegmentName] = useState('');
  const [segmentSeqOrder, setSegmentSeqOrder] = useState(1);

  const fetchBooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getBooks();
      setBooks(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch books');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const toggleExpandBook = async (bookId: string) => {
    if (expandedBookId === bookId) {
      setExpandedBookId(null);
      return;
    }
    setExpandedBookId(bookId);
    if (!bookParts[bookId]) {
      try {
        const parts = await apiClient.getBookParts(bookId);
        setBookParts((prev) => ({ ...prev, [bookId]: parts }));
      } catch (err: any) {
        console.error('Failed to fetch parts:', err);
      }
    }
  };

  const toggleExpandPart = async (partId: string) => {
    if (expandedPartId === partId) {
      setExpandedPartId(null);
      return;
    }
    setExpandedPartId(partId);
    if (!partSegments[partId]) {
      try {
        const segments = await apiClient.getBookSegments(partId);
        setPartSegments((prev) => ({ ...prev, [partId]: segments }));
      } catch (err: any) {
        console.error('Failed to fetch segments:', err);
      }
    }
  };

  const openCreateBookModal = () => {
    setFormError(null);
    setEditingBook(null);
    setBookName('');
    setBookLevel('');
    setBookSeqOrder(books.length + 1);
    setBookSessionCount(20);
    setBookIsTerminal(false);
    setIsBookModalOpen(true);
  };

  const openEditBookModal = (book: BookItem) => {
    setFormError(null);
    setEditingBook(book);
    setBookName(book.name);
    setBookLevel(book.level);
    setBookSeqOrder(book.sequenceOrder);
    setBookSessionCount(book.sessionCount);
    setBookIsTerminal(book.isTerminal);
    setIsBookModalOpen(true);
  };

  const openCreatePartModal = (book: BookItem) => {
    setFormError(null);
    setSelectedBookForPart(book);
    setPartName('');
    const existingCount = (bookParts[book.id] || []).length;
    setPartSeqOrder(existingCount + 1);
    setIsPartModalOpen(true);
  };

  const openCreateSegmentModal = (part: BookPartItem) => {
    setFormError(null);
    setSelectedPartForSegment(part);
    setSegmentName('');
    const existingCount = (partSegments[part.id] || []).length;
    setSegmentSeqOrder(existingCount + 1);
    setIsSegmentModalOpen(true);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setFormError(null);
    try {
      if (editingBook) {
        await apiClient.updateBook(editingBook.id, {
          name: bookName,
          level: bookLevel,
          sequenceOrder: Number(bookSeqOrder),
          sessionCount: Number(bookSessionCount),
          isTerminal: bookIsTerminal,
        });
        notifier.success(`Book "${bookName}" updated successfully.`);
      } else {
        await apiClient.createBook({
          name: bookName,
          level: bookLevel,
          sequenceOrder: Number(bookSeqOrder),
          sessionCount: Number(bookSessionCount),
          isTerminal: bookIsTerminal,
        });
        notifier.success(`Book "${bookName}" created successfully.`);
      }
      setIsBookModalOpen(false);
      fetchBooks();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save book');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookForPart) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await apiClient.createBookPart(selectedBookForPart.id, {
        name: partName,
        sequenceOrder: Number(partSeqOrder),
      });
      notifier.success(`Part "${partName}" added to "${selectedBookForPart.name}".`);
      setIsPartModalOpen(false);
      // Refresh parts for this book
      const parts = await apiClient.getBookParts(selectedBookForPart.id);
      setBookParts((prev) => ({ ...prev, [selectedBookForPart.id]: parts }));
    } catch (err: any) {
      setFormError(err.message || 'Failed to add book part');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartForSegment) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await apiClient.createBookSegment(selectedPartForSegment.id, {
        name: segmentName,
        sequenceOrder: Number(segmentSeqOrder),
      });
      notifier.success(`Segment "${segmentName}" added to "${selectedPartForSegment.name}".`);
      setIsSegmentModalOpen(false);
      // Refresh segments for this part
      const segments = await apiClient.getBookSegments(selectedPartForSegment.id);
      setPartSegments((prev) => ({ ...prev, [selectedPartForSegment.id]: segments }));
    } catch (err: any) {
      setFormError(err.message || 'Failed to add book segment');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Books & Curriculum Hierarchy</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage language textbooks, difficulty levels, course parts, and syllabus segment units.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBooks}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Refresh Books"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isSupervisor && (
            <button
              onClick={openCreateBookModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition shadow-md shadow-indigo-600/20"
            >
              <Plus className="h-4 w-4" />
              <span>Add Book</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}


      {/* Books List & Hierarchy */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
            <span className="text-xs">Loading books and curriculum...</span>
          </div>
        ) : books.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <BookOpen className="h-8 w-8 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-400">No Books Found</p>
            <p className="text-xs text-slate-600 mt-1">Get started by creating your first course textbook.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {books.map((book) => {
              const isExpanded = expandedBookId === book.id;
              const parts = bookParts[book.id] || [];
              return (
                <div key={book.id} className="bg-slate-900/60 hover:bg-slate-900/80 transition">
                  {/* Book Row */}
                  <div className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleExpandBook(book.id)}
                        className="p-1 text-slate-400 hover:text-white rounded bg-slate-800 transition"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{book.name}</span>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-semibold border border-indigo-500/20">
                            {book.level}
                          </span>
                          {book.isTerminal && (
                            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] font-semibold border border-purple-500/20">
                              Terminal Level
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                          <span>Sequence: #{book.sequenceOrder}</span>
                          <span>•</span>
                          <span>{book.sessionCount} Sessions</span>
                          <span>•</span>
                          <span className={book.isActive ? 'text-emerald-400' : 'text-slate-500'}>
                            {book.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSupervisor && (
                        <>
                          <button
                            onClick={() => openCreatePartModal(book)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-medium transition flex items-center gap-1 border border-slate-700"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add Part</span>
                          </button>
                          <button
                            onClick={() => openEditBookModal(book)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="Edit Book"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded Parts Hierarchy */}
                  {isExpanded && (
                    <div className="pl-12 pr-4 pb-4 bg-slate-950/40 border-t border-slate-800/40 space-y-3 pt-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 border-b border-slate-800/60 pb-1">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5 text-slate-500" />
                          Course Parts & Units
                        </span>
                        <span className="text-[10px] text-slate-500">{parts.length} Parts Configured</span>
                      </div>

                      {parts.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500 bg-slate-900/40 rounded-lg border border-slate-800">
                          No parts created yet for this book. Click &quot;Add Part&quot; to configure units.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {parts.map((part) => {
                            const isPartExpanded = expandedPartId === part.id;
                            const segments = partSegments[part.id] || [];
                            return (
                              <div
                                key={part.id}
                                className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleExpandPart(part.id)}
                                      className="p-1 text-slate-400 hover:text-white rounded bg-slate-800"
                                    >
                                      {isPartExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    <span className="font-semibold text-slate-200">
                                      Part {part.sequenceOrder}: {part.name}
                                    </span>
                                  </div>
                                  {isSupervisor && (
                                    <button
                                      onClick={() => openCreateSegmentModal(part)}
                                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-400 text-[11px] font-medium transition flex items-center gap-1"
                                    >
                                      <Plus className="h-2.5 w-2.5" />
                                      <span>Add Segment</span>
                                    </button>
                                  )}
                                </div>

                                {/* Expanded Segments */}
                                {isPartExpanded && (
                                  <div className="mt-2 pl-6 pt-2 border-t border-slate-800/50 space-y-1.5">
                                    <span className="text-[10px] text-slate-400 font-semibold block mb-1">
                                      Book Segments (Units)
                                    </span>
                                    {segments.length === 0 ? (
                                      <p className="text-[11px] text-slate-500">No segments defined.</p>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                        {segments.map((seg) => (
                                          <div
                                            key={seg.id}
                                            className="bg-slate-950 p-2 rounded border border-slate-800 flex items-center justify-between text-[11px]"
                                          >
                                            <span className="text-slate-300 font-medium">
                                              #{seg.sequenceOrder} {seg.name}
                                            </span>
                                            <Bookmark className="h-3 w-3 text-indigo-400" />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Book Modal */}
      {isBookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">{editingBook ? 'Edit Book' : 'Add New Book'}</h3>
              <button onClick={() => setIsBookModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBook} className="space-y-4 text-xs">
              <InlineError message={formError} />
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Book / Course Name *</label>
                <input
                  type="text"
                  value={bookName}
                  onChange={(e) => setBookName(e.target.value)}
                  placeholder="e.g. Touchstone 1, American English File 2"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Level Code *</label>
                  <input
                    type="text"
                    value={bookLevel}
                    onChange={(e) => setBookLevel(e.target.value)}
                    placeholder="e.g. A1, B1+, Intermediate"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Sequence Order *</label>
                  <input
                    type="number"
                    min="1"
                    value={bookSeqOrder}
                    onChange={(e) => setBookSeqOrder(parseInt(e.target.value) || 1)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Total Class Sessions *</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={bookSessionCount}
                  onChange={(e) => setBookSessionCount(parseInt(e.target.value) || 20)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="bookIsTerminal"
                  checked={bookIsTerminal}
                  onChange={(e) => setBookIsTerminal(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="bookIsTerminal" className="text-slate-300 text-xs cursor-pointer">
                  Terminal Course Level (End of curriculum track)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBookModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{editingBook ? 'Save Changes' : 'Create Book'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Part Modal */}
      {isPartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Add Part / Volume</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedBookForPart?.name}</p>
              </div>
              <button onClick={() => setIsPartModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePart} className="space-y-4 text-xs">
              <InlineError message={formError} />
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Part Name *</label>
                <input
                  type="text"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  placeholder="e.g. Units 1-6 (Part A), Volume 1"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Sequence Order *</label>
                <input
                  type="number"
                  min="1"
                  value={partSeqOrder}
                  onChange={(e) => setPartSeqOrder(parseInt(e.target.value) || 1)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPartModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Add Part</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Segment Modal */}
      {isSegmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Add Segment / Unit</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedPartForSegment?.name}</p>
              </div>
              <button onClick={() => setIsSegmentModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSegment} className="space-y-4 text-xs">
              <InlineError message={formError} />
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Segment Title *</label>
                <input
                  type="text"
                  value={segmentName}
                  onChange={(e) => setSegmentName(e.target.value)}
                  placeholder="e.g. Unit 1: Introductions & Daily Routine"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Sequence Order *</label>
                <input
                  type="number"
                  min="1"
                  value={segmentSeqOrder}
                  onChange={(e) => setSegmentSeqOrder(parseInt(e.target.value) || 1)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSegmentModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Add Segment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
