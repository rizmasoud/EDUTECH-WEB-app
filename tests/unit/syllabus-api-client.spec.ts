/**
 * The typed syllabus methods of apiClient: endpoints, HTTP methods, bodies, and how failures reach the UI.
 * `fetch` is replaced by a recorder, so nothing touches the network.
 */
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../../apps/web/lib/api-client';

interface Call {
  url: string;
  method: string;
  body: unknown;
}

const realFetch = globalThis.fetch;
let calls: Call[] = [];

function mockFetch(status: number, payload: unknown) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(payload === undefined ? '' : JSON.stringify(payload), { status });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ID = '33333333-3333-4333-8333-333333333333';
const BOOK_ID = '11111111-1111-4111-8111-111111111111';

describe('apiClient syllabus methods', () => {
  it('lists the syllabus of a book through GET /syllabi (book id only)', async () => {
    mockFetch(200, [{ id: ID }]);
    const list = await apiClient.getSyllabi({ bookId: BOOK_ID });
    assert.deepEqual(list, [{ id: ID }]);
    assert.deepEqual(calls, [
      { url: `/api/v1/syllabi?bookId=${BOOK_ID}`, method: 'GET', body: undefined },
    ]);
  });

  it('lists without a query string when no filter is given', async () => {
    mockFetch(200, []);
    await apiClient.getSyllabi();
    assert.equal(calls[0].url, '/api/v1/syllabi');
  });

  it('accepts an array, an { items } page or a { data } envelope as the list', async () => {
    mockFetch(200, { items: [{ id: 'a' }] });
    assert.deepEqual(await apiClient.getSyllabi({ bookId: BOOK_ID }), [{ id: 'a' }]);
    mockFetch(200, { data: [{ id: 'b' }] });
    assert.deepEqual(await apiClient.getSyllabi({ bookId: BOOK_ID }), [{ id: 'b' }]);
    mockFetch(200, null);
    assert.deepEqual(await apiClient.getSyllabi({ bookId: BOOK_ID }), []);
  });

  it('loads one syllabus with its items through GET /syllabi/:id', async () => {
    const detail = { id: ID, bookId: BOOK_ID, items: [{ id: 'i1', sequenceOrder: 1 }] };
    mockFetch(200, detail);
    assert.deepEqual(await apiClient.getSyllabus(ID), detail);
    assert.deepEqual(calls, [{ url: `/api/v1/syllabi/${ID}`, method: 'GET', body: undefined }]);
  });

  it('creates a syllabus with POST /syllabi and the shared create body', async () => {
    mockFetch(201, { id: ID });
    await apiClient.createSyllabus({ bookId: BOOK_ID });
    assert.deepEqual(calls, [
      { url: '/api/v1/syllabi', method: 'POST', body: { bookId: BOOK_ID } },
    ]);
  });

  it('edits a syllabus with PATCH /syllabi/:id', async () => {
    mockFetch(200, { id: ID });
    await apiClient.updateSyllabus(ID, { bookId: BOOK_ID });
    assert.deepEqual(calls, [{ url: `/api/v1/syllabi/${ID}`, method: 'PATCH', body: { bookId: BOOK_ID } }]);
  });

  it('adds an item with POST /syllabi/:id/items', async () => {
    const body = { type: 'GRAMMAR' as const, title: 'Past simple', description: null, required: true, sequenceOrder: 3 };
    mockFetch(201, { id: 'i1', ...body });
    await apiClient.addSyllabusItem(ID, body);
    assert.deepEqual(calls, [{ url: `/api/v1/syllabi/${ID}/items`, method: 'POST', body }]);
  });

  it('edits an item, including reordering, with PATCH /syllabus-items/:id', async () => {
    mockFetch(200, { id: 'i1' });
    await apiClient.updateSyllabusItem('i1', { sequenceOrder: 4 });
    assert.deepEqual(calls, [{ url: '/api/v1/syllabus-items/i1', method: 'PATCH', body: { sequenceOrder: 4 } }]);
  });

  it('url-encodes ids it puts in a path', async () => {
    mockFetch(200, { id: 'x' });
    await apiClient.getSyllabus('a/b?c');
    assert.equal(calls[0].url, '/api/v1/syllabi/a%2Fb%3Fc');
  });

  it('offers no way to delete a syllabus item (the API cannot say whether it was used in a Lesson Plan)', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(apiClient));
    // Other modules legitimately have deleteSchedule/deleteTeacherSkill; only syllabus deletion is ruled out.
    assert.deepEqual(methods.filter((m) => /delete|remove/i.test(m) && /syllab/i.test(m)), []);
    assert.equal((apiClient as unknown as Record<string, unknown>).deleteSyllabusItem, undefined);
  });
});

describe('apiClient syllabus failures reach the UI with the backend message', () => {
  it('rejects a duplicate sequence order with the API message, status and code', async () => {
    mockFetch(400, { code: 'INVALID_INPUT', message: 'Sequence order 2 is already in use for this syllabus' });
    await assert.rejects(
      () => apiClient.updateSyllabusItem('i1', { sequenceOrder: 2 }),
      (err: Error & { statusCode?: number; code?: string }) => {
        assert.equal(err.message, 'Sequence order 2 is already in use for this syllabus');
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_INPUT');
        return true;
      },
    );
  });

  it('surfaces a 409 when the book already has its syllabus', async () => {
    mockFetch(409, { code: 'CONFLICT', message: `Book ${BOOK_ID} already has a syllabus. Each book has exactly one syllabus.` });
    await assert.rejects(
      () => apiClient.createSyllabus({ bookId: BOOK_ID }),
      (err: Error & { statusCode?: number }) => err.statusCode === 409 && /already has a syllabus/.test(err.message),
    );
  });

  it('surfaces a 403 for a non-Supervisor write', async () => {
    mockFetch(403, { code: 'FORBIDDEN_RESOURCE', message: 'Only supervisors can create a syllabus' });
    await assert.rejects(
      () => apiClient.createSyllabus({ bookId: BOOK_ID }),
      (err: Error & { statusCode?: number; code?: string }) => err.statusCode === 403 && err.code === 'FORBIDDEN_RESOURCE',
    );
  });

  it('surfaces a 404', async () => {
    mockFetch(404, { code: 'RESOURCE_NOT_FOUND', message: `Syllabus with id ${ID} not found` });
    await assert.rejects(
      () => apiClient.getSyllabus(ID),
      (err: Error & { statusCode?: number }) => err.statusCode === 404 && /not found/.test(err.message),
    );
  });
});
