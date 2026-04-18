/**
 * Sandbox Operator Panel
 *
 * Visual interface for managing agentic-sandbox instances: view registered
 * sandboxes, agent inventory, loadout details, and lifecycle controls
 * (provision, start, stop, reprovision, destroy).
 *
 * @issue #733
 */

import { useCallback, useEffect, useReducer } from 'react';
import { api, type SandboxSummary, type SandboxAgent } from '../../lib/api.js';
import styles from './SandboxPanel.module.css';
import { SessionPicker } from './SessionPicker.js';

// ---- State ----

interface State {
  sandboxes: SandboxSummary[];
  selectedSandbox: string | null;
  loading: boolean;
  error: string | null;
  actionInProgress: string | null;
}

type Action =
  | { type: 'SET_SANDBOXES'; sandboxes: SandboxSummary[] }
  | { type: 'SET_SELECTED'; id: string | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_ACTION'; id: string | null };

const INITIAL: State = {
  sandboxes: [],
  selectedSandbox: null,
  loading: false,
  error: null,
  actionInProgress: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SANDBOXES': {
      const selected = state.selectedSandbox && action.sandboxes.some(s => s.id === state.selectedSandbox)
        ? state.selectedSandbox
        : action.sandboxes[0]?.id ?? null;
      return { ...state, sandboxes: action.sandboxes, selectedSandbox: selected };
    }
    case 'SET_SELECTED':
      return { ...state, selectedSandbox: action.id };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'SET_ACTION':
      return { ...state, actionInProgress: action.id };
    default:
      return state;
  }
}

// ---- Helpers ----

const STATUS_COLORS: Record<string, string> = {
  ready: '#4caf50',
  busy: '#ff9800',
  provisioning: '#2196f3',
  starting: '#2196f3',
  error: '#f44336',
  disconnected: '#555',
};

function statusBadge(status: string) {
  return (
    <span
      className={styles.statusDot}
      style={{ background: STATUS_COLORS[status] || '#555' }}
      title={status}
      aria-label={`Status: ${status}`}
    />
  );
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function shortId(id?: string): string {
  return id ? id.slice(0, 8) : '';
}

// ---- Component ----

export function SandboxPanel() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  // Poll sandboxes
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await api.sandboxes();
        if (active) dispatch({ type: 'SET_SANDBOXES', sandboxes: data.sandboxes });
      } catch {
        // Server not ready
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const selectedSandbox = state.sandboxes.find(s => s.id === state.selectedSandbox);

  const handleAgentAction = useCallback(async (
    sandboxId: string,
    agentId: string,
    action: 'start' | 'stop' | 'destroy' | 'reprovision',
  ) => {
    dispatch({ type: 'SET_ACTION', id: `${agentId}-${action}` });
    try {
      await api.agentAction(sandboxId, agentId, action);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `${action} failed: ${err}` });
    } finally {
      dispatch({ type: 'SET_ACTION', id: null });
    }
  }, []);

  return (
    <div className={styles.panel}>
      {/* Sidebar: sandbox list */}
      <aside className={styles.sidebar} aria-label="Registered sandboxes">
        <h3 className={styles.sidebarTitle}>Sandboxes</h3>
        {state.sandboxes.length === 0 ? (
          <div className={styles.empty}>
            <p>No sandboxes registered.</p>
            <p className={styles.hint}>
              Start an agentic-sandbox with <code>aiwg_serve.enabled = true</code> to see it here.
            </p>
          </div>
        ) : (
          <ul className={styles.sandboxList}>
            {state.sandboxes.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={[
                    s.id === state.selectedSandbox ? styles.sandboxItemActive : styles.sandboxItem,
                    !s.connected ? styles.sandboxItemDisconnected : '',
                  ].join(' ')}
                  onClick={() => dispatch({ type: 'SET_SELECTED', id: s.id })}
                >
                  <span className={styles.sandboxName}>{s.name}</span>
                  <span className={styles.sandboxMeta}>
                    {statusBadge(s.connected ? 'ready' : 'disconnected')}
                    {s.connected
                      ? `${s.agentCount} agent${s.agentCount !== 1 ? 's' : ''}`
                      : 'offline'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main: sandbox detail + agent grid */}
      <div className={styles.main}>
        {!selectedSandbox ? (
          <div className={styles.emptyMain}>
            <p>Select a sandbox to view details</p>
          </div>
        ) : (
          <>
            {/* Sandbox header */}
            <div className={styles.sandboxHeader}>
              <h2 className={styles.sandboxTitle}>
                {statusBadge(selectedSandbox.connected ? 'ready' : 'disconnected')}
                {selectedSandbox.name}
                {!selectedSandbox.connected && (
                  <span className={styles.offlineBadge}>offline</span>
                )}
              </h2>
              <div className={styles.sandboxInfo}>
                <span>v{selectedSandbox.version}</span>
                <span>{selectedSandbox.capabilities.join(', ')}</span>
                {selectedSandbox.connected && (
                  <span title="HTTP endpoint">{selectedSandbox.httpEndpoint}</span>
                )}
                {selectedSandbox.instanceId && (
                  <span className={styles.instanceId} title={`Instance ID: ${selectedSandbox.instanceId}`}>
                    #{shortId(selectedSandbox.instanceId)}
                  </span>
                )}
              </div>
            </div>

            {/* Disconnected last-session info */}
            {!selectedSandbox.connected && (
              <div className={styles.disconnectedBanner}>
                <div className={styles.disconnectedIcon}>⚠</div>
                <div className={styles.disconnectedInfo}>
                  <strong>Sandbox offline</strong>
                  <p>This sandbox is no longer connected. It will reappear automatically when it reconnects.</p>
                  <div className={styles.lastSessionGrid}>
                    {selectedSandbox.disconnectedAt && (
                      <><span className={styles.lastSessionLabel}>Disconnected</span>
                      <span>{fmtTime(selectedSandbox.disconnectedAt)}</span></>
                    )}
                    <span className={styles.lastSessionLabel}>Last active</span>
                    <span>{fmtTime(selectedSandbox.lastEventAt)}</span>
                    <span className={styles.lastSessionLabel}>Last registered</span>
                    <span>{fmtTime(selectedSandbox.lastRegisteredAt)}</span>
                    {selectedSandbox.instanceId && (
                      <><span className={styles.lastSessionLabel}>Instance ID</span>
                      <span className={styles.monoSmall}>{selectedSandbox.instanceId}</span></>
                    )}
                    <span className={styles.lastSessionLabel}>Endpoint</span>
                    <span className={styles.monoSmall}>{selectedSandbox.httpEndpoint}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Agent grid */}
            <div className={styles.agentGrid} role="list" aria-label="Agents">
              {selectedSandbox.agents.length === 0 ? (
                <div className={styles.emptyAgents}>
                  {selectedSandbox.connected ? 'No agents connected' : 'No agent data from last session'}
                </div>
              ) : (
                selectedSandbox.agents.map((agent) => (
                  <AgentCard
                    key={agent.agentId}
                    agent={agent}
                    sandboxId={selectedSandbox.id}
                    onAction={handleAgentAction}
                    actionInProgress={state.actionInProgress}
                    sandboxConnected={selectedSandbox.connected}
                  />
                ))
              )}
            </div>

            {state.error && (
              <div className={styles.error} role="alert">
                {state.error}
                <button type="button" onClick={() => dispatch({ type: 'SET_ERROR', error: null })}>x</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Agent Card ----

function AgentCard({
  agent,
  sandboxId,
  onAction,
  actionInProgress,
  sandboxConnected,
}: {
  agent: SandboxAgent;
  sandboxId: string;
  onAction: (sandboxId: string, agentId: string, action: 'start' | 'stop' | 'destroy' | 'reprovision') => void;
  actionInProgress: string | null;
  sandboxConnected: boolean;
}) {
  const busy = actionInProgress?.startsWith(agent.agentId);

  return (
    <div
      className={[styles.agentCard, !sandboxConnected ? styles.agentCardOffline : ''].join(' ')}
      role="listitem"
    >
      <div className={styles.agentHeader}>
        {statusBadge(sandboxConnected ? agent.status : 'disconnected')}
        <strong className={styles.agentId}>{agent.agentId}</strong>
        {agent.loadout && (
          <span className={styles.loadoutBadge}>{agent.loadout}</span>
        )}
      </div>

      {agent.aiwgFrameworks && agent.aiwgFrameworks.length > 0 && (
        <div className={styles.frameworks}>
          {agent.aiwgFrameworks.map((fw) => (
            <span key={fw.name} className={styles.fwBadge} title={`Providers: ${fw.providers.join(', ')}`}>
              {fw.name}
            </span>
          ))}
        </div>
      )}

      <div className={styles.agentActions}>
        {sandboxConnected && agent.status === 'ready' && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onAction(sandboxId, agent.agentId, 'stop')}
            disabled={busy}
          >
            Stop
          </button>
        )}
        {sandboxConnected && agent.status === 'disconnected' && (
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onAction(sandboxId, agent.agentId, 'start')}
            disabled={busy}
          >
            Start
          </button>
        )}
        {sandboxConnected && (
          <>
            <button
              type="button"
              className={styles.actionBtnSecondary}
              onClick={() => onAction(sandboxId, agent.agentId, 'reprovision')}
              disabled={busy}
            >
              Reprovision
            </button>
            <button
              type="button"
              className={styles.actionBtnDanger}
              onClick={() => onAction(sandboxId, agent.agentId, 'destroy')}
              disabled={busy}
            >
              Destroy
            </button>
          </>
        )}
        {!sandboxConnected && (
          <span className={styles.offlineNote}>Actions unavailable while offline</span>
        )}
      </div>

      {/* Session picker — only when sandbox is connected and agent is active */}
      {sandboxConnected && (agent.status === 'ready' || agent.status === 'busy') && (
        <SessionPicker
          sandboxId={sandboxId}
          agentId={agent.agentId}
        />
      )}
    </div>
  );
}
