// R-N10 — React side of durable run state.
//
// useRunRecord(db, kind, id) watches the AppConfig run record for one session
// or decision and exposes:
//   record   the stored record (or null)
//   status   'none' | 'own' | 'alive' | 'stale'   (see lib/runState.classifyRun)
//   start / beat / finish   owner-side writes, heartbeating on an interval
//   warning  set when a heartbeat write fails, so the UI can say so
//
// The tab id lives in sessionStorage so a reload of the same tab is treated as
// a new tab: a run the old page was driving is then correctly seen as stale.

import { useCallback, useEffect, useRef, useState } from 'react';
import { readKV, writeKV, deleteKV } from '@/lib/appConfigKV';
import { runKey, makeRunRecord, touchRun, classifyRun, HEARTBEAT_MS } from '@/lib/runState';

const TAB_KEY = 'agd_tab_id';

export function getTabId() {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage unavailable (private mode, blocked storage): fall back to a
    // per-page id. Ownership then survives in-app navigation but not a reload,
    // which is the conservative outcome.
    if (!globalThis.__agdTabId) globalThis.__agdTabId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return globalThis.__agdTabId;
  }
}

export function useRunRecord(db, kind, id) {
  const key = id ? runKey(kind, id) : null;
  const tabId = getTabId();
  const [record, setRecord] = useState(null);
  const [status, setStatus] = useState('none');
  const [warning, setWarning] = useState(null);
  const ownRef = useRef(null);        // the record this tab is driving, if any
  const beatTimer = useRef(null);

  const refresh = useCallback(async () => {
    if (!db || !key) return;
    try {
      const rec = await readKV(db, key);
      setRecord(rec);
      setStatus(classifyRun(rec, tabId));
    } catch (e) {
      setWarning(`Could not read run state: ${e.message}`);
    }
  }, [db, key, tabId]);

  // Poll while mounted. Owners poll too, so a record deleted elsewhere is noticed.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const persist = useCallback(async (rec) => {
    try {
      await writeKV(db, key, rec);
      setWarning(null);
    } catch (e) {
      setWarning(`Progress could not be recorded (${e.message}). The run continues, but another tab may see it as interrupted.`);
    }
  }, [db, key]);

  /** Claim the run for this tab and start heartbeating. */
  const start = useCallback(async (fields) => {
    if (!db || !key) return;
    const rec = makeRunRecord({ kind, id, tabId, ...fields });
    ownRef.current = rec;
    setRecord(rec);
    setStatus('own');
    await persist(rec);
    clearInterval(beatTimer.current);
    beatTimer.current = setInterval(() => {
      if (!ownRef.current) return;
      ownRef.current = touchRun(ownRef.current);
      persist(ownRef.current);
    }, HEARTBEAT_MS);
  }, [db, key, kind, id, tabId, persist]);

  /** Record progress (step, total, label, stage, optionIndex…). */
  const beat = useCallback(async (patch) => {
    if (!ownRef.current) return;
    ownRef.current = touchRun(ownRef.current, patch);
    setRecord(ownRef.current);
    await persist(ownRef.current);
  }, [persist]);

  /** Release the run: stop heartbeating and delete the record. */
  const finish = useCallback(async () => {
    clearInterval(beatTimer.current);
    beatTimer.current = null;
    ownRef.current = null;
    if (!db || !key) return;
    try {
      await deleteKV(db, key);
      setRecord(null);
      setStatus('none');
    } catch (e) {
      setWarning(`Run finished but its record could not be cleared (${e.message}). Dismiss the banner to clear it.`);
    }
  }, [db, key]);

  // Leaving the page while this tab owns a run: stop the heartbeat so the record
  // goes stale promptly, and warn the user that the loop will stop.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!ownRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearInterval(beatTimer.current);
    };
  }, []);

  return { record, status, warning, tabId, isOwner: status === 'own', start, beat, finish, refresh, clearWarning: () => setWarning(null) };
}
