import { Worker } from 'node:worker_threads';
// A session advisory lock permits one local dispatcher, including during restart.
export async function startAnalysisQueue(pool, workerFactory = id => new Worker(new URL('./analysisWorker.js', import.meta.url), { workerData: { analysisJobId: id } })) {
  const lock = await pool.connect();
  const acquired = (await lock.query('SELECT pg_try_advisory_lock(8142026) AS acquired')).rows[0].acquired;
  if (!acquired) { lock.release(); throw new Error('Another analysis dispatcher is running.'); }
  await pool.query("UPDATE analysis_jobs SET status=CASE WHEN cancel_requested THEN 'cancelled' ELSE 'queued' END,updated_at=now() WHERE status='running'");
  let active = null, busy = false, stopped = false;
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      if (active) {
        const row = (await pool.query('SELECT cancel_requested FROM analysis_jobs WHERE id=$1', [active.id])).rows[0];
        if (!row || row.cancel_requested) {
          const current = active;
          await current.worker.terminate();
          await pool.query("UPDATE analysis_jobs SET status='cancelled',updated_at=now() WHERE id=$1 AND status='running'", [current.id]);
          active = null;
        }
        return;
      }
      const job = (await pool.query("UPDATE analysis_jobs SET status='running',updated_at=now() WHERE id=(SELECT id FROM analysis_jobs WHERE status='queued' AND NOT cancel_requested ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id")).rows[0];
      if (!job) return;
      const worker = workerFactory(job.id);
      active = { id: job.id, worker };
      worker.on('error', () => {}); // Exit handler records a safe error without credentials.
      worker.on('exit', async () => {
        try { await pool.query("UPDATE analysis_jobs SET status=CASE WHEN cancel_requested THEN 'cancelled' WHEN $2 THEN 'queued' ELSE 'failed' END,error=CASE WHEN cancel_requested OR $2 THEN null ELSE 'The analysis worker stopped. Resume to continue from saved progress.' END,updated_at=now() WHERE id=$1 AND status='running'", [job.id, stopped]); }
        catch { /* a database outage leaves durable running state for restart recovery */ }
        if (active?.id === job.id) active = null;
      });
    } catch { /* Retry queue access after transient database failures. */ }
    finally { busy = false; }
  }
  const timer = setInterval(tick, 1500);
  timer.unref();
  await tick();
  return async () => {
    stopped = true; clearInterval(timer);
    while (busy) await new Promise(resolve => setTimeout(resolve, 25));
    if (active) await active.worker.terminate();
    await lock.query('SELECT pg_advisory_unlock(8142026)'); lock.release();
  };
}
