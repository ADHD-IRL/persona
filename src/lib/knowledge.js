// ⚠️ MAINTAINERS: formatKnowledgeContext()'s injected block is documented in the
// Prompt Library page (src/pages/PromptLibrary.jsx) — keep it in sync on changes.
//
// Organizational knowledge base — retrieval-augmented prompting.
// Documents are chunked on ingest; retrieval scores chunks against a query by
// keyword overlap (MVP; a pgvector semantic upgrade can slot in behind
// retrieveKnowledge without changing callers).

const STOPWORDS = new Set('the a an and or of to in for on with is are be this that it as at by from into over under after before during about your you our we they their its'.split(' '));

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// Split a document into ~overlapping chunks on paragraph/sentence boundaries.
export function chunkText(content, { targetChars = 900, overlap = 150 } = {}) {
  const text = (content || '').trim();
  if (!text) return [];
  // Prefer paragraph splits; fall back to hard windows for long paragraphs
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';
  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ''; };
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > targetChars && buf) {
      flush();
      // carry a little overlap for context continuity
      buf = chunks.length ? chunks[chunks.length - 1].slice(-overlap) + '\n\n' + p : p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
    while (buf.length > targetChars * 1.6) {
      chunks.push(buf.slice(0, targetChars).trim());
      buf = buf.slice(targetChars - overlap);
    }
  }
  flush();
  return chunks.map((content, i) => ({ content, chunk_index: i }));
}

// Score a chunk against query terms: term-frequency overlap, length-normalized.
function scoreChunk(chunkTokens, queryTerms) {
  if (!chunkTokens.length) return 0;
  const set = new Set(chunkTokens);
  let hits = 0;
  for (const t of queryTerms) if (set.has(t)) hits++;
  // reward coverage of distinct query terms, lightly normalized by chunk length
  return hits / Math.sqrt(chunkTokens.length / 40 + 1);
}

/**
 * Retrieve the top-k most relevant knowledge chunks for a query.
 * @returns [{ id, title, content, score, document_id }]
 */
export async function retrieveKnowledge(db, query, k = 5) {
  if (!db?.KnowledgeChunk) return [];
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  let chunks;
  try {
    chunks = await db.KnowledgeChunk.list();
  } catch {
    return [];
  }
  if (!chunks?.length) return [];
  const scored = chunks
    .map(c => ({ ...c, score: scoreChunk(tokenize(`${c.title || ''} ${c.content}`), terms) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored;
}

// Format retrieved chunks into a prompt block agents can cite.
export function formatKnowledgeContext(chunks) {
  if (!chunks?.length) return '';
  const body = chunks.map((c, i) =>
    `[K${i + 1}${c.title ? ` — ${c.title}` : ''}]\n${(c.content || '')}`
  ).join('\n\n');
  return `\nORGANIZATIONAL KNOWLEDGE BASE (retrieved for this scenario — ground your analysis in these where relevant and cite as [SOURCE: "title"]):\n${body}\n`;
}
