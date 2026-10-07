// R-N11 — read every row of a table, not just the first PostgREST page.
//
// Supabase (PostgREST) caps a single select at 1,000 rows and returns the
// first page silently, so any table past that size looked truncated in the
// app: the Experts page and the persona export showed 1,000 of 1,167 agents.
// This helper walks the table in pages of PAGE_SIZE until a page comes back
// short. No '@' imports so it loads in plain node for scripts/pageAll.test.mjs.

export const PAGE_SIZE = 1000;

/**
 * @param {() => any} makeQuery  returns a fresh PostgREST builder each call
 *   (a builder is mutated by .range()/.limit(), so it cannot be reused).
 * @param {{ limit?: number, pageSize?: number }} [opts]
 * @returns {Promise<any[]>}
 */
export async function fetchAllRows(makeQuery, { limit, pageSize = PAGE_SIZE } = {}) {
  // A small explicit limit is one capped request, exactly as before.
  if (limit != null && limit <= pageSize) {
    const { data, error } = await makeQuery().limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    if (limit != null && rows.length >= limit) break;
  }
  return limit != null ? rows.slice(0, limit) : rows;
}
