// R-N11 — reads page past PostgREST's 1,000-row cap.
// Run: node scripts/pageAll.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows, PAGE_SIZE } from '../src/lib/pageAll.js';

// Fake PostgREST builder: records the range asked for and resolves a slice.
function fakeTable(rows, { failOnPage = -1 } = {}) {
  const calls = [];
  const make = () => {
    const q = {
      _from: 0, _to: rows.length - 1, _limit: null,
      range(from, to) { q._from = from; q._to = to; return q; },
      limit(n) { q._limit = n; return q; },
      then(resolve) {
        calls.push({ from: q._from, to: q._to, limit: q._limit });
        if (failOnPage === calls.length - 1) return resolve({ data: null, error: new Error('boom') });
        const data = q._limit != null ? rows.slice(0, q._limit) : rows.slice(q._from, q._to + 1);
        return resolve({ data, error: null });
      },
    };
    return q;
  };
  return { make, calls };
}

const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

test('page size is PostgREST default', () => {
  assert.equal(PAGE_SIZE, 1000);
});

test('short table: one request, all rows', async () => {
  const t = fakeTable(rowsOf(7));
  const out = await fetchAllRows(t.make);
  assert.equal(out.length, 7);
  assert.equal(t.calls.length, 1);
  assert.deepEqual(t.calls[0], { from: 0, to: 999, limit: null });
});

test('exactly one full page: second request confirms the end', async () => {
  const t = fakeTable(rowsOf(1000));
  const out = await fetchAllRows(t.make);
  assert.equal(out.length, 1000);
  assert.equal(t.calls.length, 2);
  assert.deepEqual(t.calls[1], { from: 1000, to: 1999, limit: null });
});

test('1,167 rows come back whole, in order, in two pages', async () => {
  const t = fakeTable(rowsOf(1167));
  const out = await fetchAllRows(t.make);
  assert.equal(out.length, 1167);
  assert.equal(out[1166].id, 1166);
  assert.equal(t.calls.length, 2);
});

test('explicit limit is a single capped request, no paging', async () => {
  const t = fakeTable(rowsOf(5000));
  const out = await fetchAllRows(t.make, { limit: 25 });
  assert.equal(out.length, 25);
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].limit, 25);
});

test('limit above a page still pages, then trims', async () => {
  const t = fakeTable(rowsOf(5000));
  const out = await fetchAllRows(t.make, { limit: 1500 });
  assert.equal(out.length, 1500);
  assert.equal(t.calls.length, 2);
});

test('empty table resolves to an empty array', async () => {
  const t = fakeTable([]);
  assert.deepEqual(await fetchAllRows(t.make), []);
});

test('a failing page rejects instead of returning a partial list', async () => {
  const t = fakeTable(rowsOf(2500), { failOnPage: 1 });
  await assert.rejects(() => fetchAllRows(t.make), /boom/);
});
