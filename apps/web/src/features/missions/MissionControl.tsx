/**
 * Mission Control UI panel.
 *
 * Visual interface over aiwg mc commands — start sessions, dispatch tasks,
 * monitor live mission status, pause/resume/abort.
 *
 * @issue #715
 */

import { useEffect, useReducer, useCallback } from 'react';
import { api } from '../../lib/api.js';
import styles from './MissionControl.module.css';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface Mission {
  id: string;
  task: string;
  completion: string;
  status: 'queued' | 'running' | 'paused' | 'complete' | 'aborted' | 'failed';
  iteration: number;
  passEstimate: number;
  scopeTotal: number;
  scopeDone: number;
  lastAction: string;
  gateResult: 'pass' | 'fail' | 'pending';
}

export interface McSession {
  id: string;
  name: string;
  status: 'active' | 'stopped';
  missions: Mission[];
}

interface State {
  sessions: McSession[];
  activeSessionId: string | null;
  dispatchTask: string;
  dispatchCompletion: string;
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_SESSIONS'; sessions: McSession[] }
  | { type: 'SET_ACTIVE'; id: string | null }
  | { type: 'SET_TASK'; value: string }
  | { type: 'SET_COMPLETION'; value: string }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'OPTIMISTIC_MISSION_STATUS'; missionId: string; status: Mission['status'] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions };
    case 'SET_ACTIVE':
      return { ...state, activeSessionId: action.id };
    case 'SET_TASK':
      return { ...state, dispatchTask: action.value };
    case 'SET_COMPLETION':
      return { ...state, dispatchCompletion: action.value };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'OPTIMISTIC_MISSION_STATUS':
      return {
        ...state,
        sessions: state.sessions.map((s) => ({
          ...s,
          missions: s.missions.map((m) =>
            m.id === action.missionId ? { ...m, status: action.status } : m,
          ),
        })),
      };
    default:
      return state;
  }
}

const INITIAL: State = {
  sessions: [],
  activeSessionId: null,
  dispatchTask: '',
  dispatchCompletion: '',
  loading: false,
  error: null,
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function gateColor(result: Mission['gateResult']): string {
  return result === 'pass' ? '#00ff88' : result === 'fail' ? '#ff6060' : '#888';
}

function statusBadgeClass(status: Mission['status']): string {
  const map: Record<Mission['status'], string> = {
    queued: styles.badgeQueued,
    running: styles.badgeRunning,
    paused: styles.badgePaused,
    complete: styles.badgeComplete,
    aborted: styles.badgeAborted,
    failed: styles.badgeFailed,
  };
  return map[status] ?? '';
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function MissionControl() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const activeSession = state.sessions.find((s) => s.id === state.activeSessionId) ?? null;

  // Poll /api/missions every 2s
  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const data = await api.missions();
        if (!active) return;
        // Server returns { missions: [] } for now — wrap in a stub session
        // Real structure: { sessions: McSession[] } once #711 MC API lands
        const raw = data as unknown as { sessions?: McSession[] };
        const sessions: McSession[] = raw.sessions ?? [];
        dispatch({ type: 'SET_SESSIONS', sessions });
        if (sessions.length > 0 && !state.activeSessionId) {
          dispatch({ type: 'SET_ACTIVE', id: sessions[0].id });
        }
      } catch {
        // server not ready
      }
    }

    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartSession = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Session ${Date.now()}` }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Start session failed: ${String(err)}` });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, []);

  const handleDispatch = useCallback(async () => {
    if (!state.activeSessionId || !state.dispatchTask.trim()) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const res = await fetch(`/api/sessions/${state.activeSessionId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: state.dispatchTask, completion: state.dispatchCompletion }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dispatch({ type: 'SET_TASK', value: '' });
      dispatch({ type: 'SET_COMPLETION', value: '' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Dispatch failed: ${String(err)}` });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [state.activeSessionId, state.dispatchTask, state.dispatchCompletion]);

  const handleMissionAction = useCallback(async (
    missionId: string,
    action: 'pause' | 'resume' | 'abort',
  ) => {
    const optimistic: Mission['status'] = action === 'pause' ? 'paused' : action === 'resume' ? 'running' : 'aborted';
    dispatch({ type: 'OPTIMISTIC_MISSION_STATUS', missionId, status: optimistic });
    try {
      const method = action === 'abort' ? 'DELETE' : 'PUT';
      const path = action === 'abort'
        ? `/api/missions/${missionId}`
        : `/api/missions/${missionId}/${action}`;
      const res = await fetch(path, { method });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Action ${action} failed: ${String(err)}` });
    }
  }, []);

  return (
    <div className={styles.panel}>
      {/* Sidebar — session list */}
      <aside className={styles.sidebar} aria-label="MC sessions">
        <div className={styles.sidebarHeader}>
          <h2>Sessions</h2>
          <button
            type="button"
            onClick={handleStartSession}
            disabled={state.loading}
            aria-label="Start new Mission Control session"
          >
            + New
          </button>
        </div>
        {state.sessions.length === 0 ? (
          <p className={styles.empty}>No active sessions</p>
        ) : (
          <ul role="listbox" aria-label="Session list">
            {state.sessions.map((s) => (
              <li
                key={s.id}
                role="option"
                aria-selected={s.id === state.activeSessionId}
                className={`${styles.sessionItem} ${s.id === state.activeSessionId ? styles.selected : ''}`}
                onClick={() => dispatch({ type: 'SET_ACTIVE', id: s.id })}
                onKeyDown={(e) => { if (e.key === 'Enter') dispatch({ type: 'SET_ACTIVE', id: s.id }); }}
                tabIndex={0}
              >
                <span className={styles.sessionName}>{s.name}</span>
                <span className={s.status === 'active' ? styles.activeIndicator : styles.stoppedIndicator}>
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main — dispatch + mission grid */}
      <main className={styles.main}>
        {state.error && (
          <div className={styles.errorBanner} role="alert">
            {state.error}
            <button type="button" onClick={() => dispatch({ type: 'SET_ERROR', error: null })} aria-label="Dismiss error">✕</button>
          </div>
        )}

        {/* Dispatch form */}
        <section className={styles.dispatchForm} aria-label="Dispatch mission">
          <h3>Dispatch Mission</h3>
          <label htmlFor="task-input">Task</label>
          <textarea
            id="task-input"
            value={state.dispatchTask}
            onChange={(e) => dispatch({ type: 'SET_TASK', value: e.target.value })}
            placeholder="Fix all failing tests in src/cli/"
            rows={2}
            aria-required="true"
          />
          <label htmlFor="completion-input">Completion criteria</label>
          <input
            id="completion-input"
            type="text"
            value={state.dispatchCompletion}
            onChange={(e) => dispatch({ type: 'SET_COMPLETION', value: e.target.value })}
            placeholder="All tests pass: npm test"
          />
          <button
            type="button"
            onClick={handleDispatch}
            disabled={state.loading || !state.activeSessionId || !state.dispatchTask.trim()}
            aria-label="Dispatch mission to active session"
          >
            {state.loading ? 'Dispatching…' : 'Dispatch'}
          </button>
        </section>

        {/* Mission grid */}
        {activeSession && (
          <section className={styles.missionGrid} aria-label={`Missions in session ${activeSession.name}`}>
            <h3>
              Missions — {activeSession.name}
              <span className={styles.missionCount}>({activeSession.missions.length})</span>
            </h3>
            {activeSession.missions.length === 0 ? (
              <p className={styles.empty}>No missions yet — dispatch one above.</p>
            ) : (
              <ul className={styles.cards}>
                {activeSession.missions.map((m) => (
                  <li key={m.id} className={styles.card} aria-label={`Mission: ${m.task}`}>
                    <header className={styles.cardHeader}>
                      <span className={`${styles.badge} ${statusBadgeClass(m.status)}`}
                        role="status" aria-label={`Status: ${m.status}`}>
                        {m.status}
                      </span>
                      <span
                        className={styles.gateIndicator}
                        style={{ color: gateColor(m.gateResult) }}
                        title={`Gate: ${m.gateResult}`}
                        aria-label={`Quality gate: ${m.gateResult}`}
                      >
                        ●
                      </span>
                    </header>

                    <p className={styles.taskText}>{m.task}</p>

                    <div className={styles.metrics} aria-label="Mission metrics">
                      <span title="Passes completed / estimated">
                        Pass {m.iteration}/{m.passEstimate}
                      </span>
                      <span title="Scope units completed">
                        Scope {m.scopeDone}/{m.scopeTotal}
                      </span>
                    </div>

                    {m.scopeTotal > 0 && (
                      <div
                        className={styles.progressBar}
                        role="progressbar"
                        aria-valuenow={m.scopeDone}
                        aria-valuemin={0}
                        aria-valuemax={m.scopeTotal}
                        aria-label={`Scope progress: ${m.scopeDone} of ${m.scopeTotal}`}
                      >
                        <div
                          className={styles.progressFill}
                          style={{ width: `${Math.round((m.scopeDone / m.scopeTotal) * 100)}%` }}
                        />
                      </div>
                    )}

                    {m.lastAction && (
                      <p className={styles.lastAction} aria-label="Last agent action">
                        {m.lastAction}
                      </p>
                    )}

                    <footer className={styles.cardActions}>
                      {m.status === 'running' && (
                        <button type="button" onClick={() => handleMissionAction(m.id, 'pause')}
                          aria-label={`Pause mission ${m.id}`}>Pause</button>
                      )}
                      {m.status === 'paused' && (
                        <button type="button" onClick={() => handleMissionAction(m.id, 'resume')}
                          aria-label={`Resume mission ${m.id}`}>Resume</button>
                      )}
                      {(m.status === 'running' || m.status === 'paused' || m.status === 'queued') && (
                        <button type="button" onClick={() => handleMissionAction(m.id, 'abort')}
                          aria-label={`Abort mission ${m.id}`}
                          className={styles.abortBtn}>Abort</button>
                      )}
                    </footer>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
