/**
 * Sandbox Operator Panel
 *
 * Visual interface for managing agentic-sandbox instances: view registered
 * sandboxes, agent inventory, loadout details, and lifecycle controls
 * (provision, start, stop, reprovision, destroy).
 *
 * @issue #733
 */

import { useCallback, useEffect, useReducer, useState } from 'react';
import { api, type SandboxSummary, type SandboxAgent, type SandboxTask, type SubmitTaskRequest } from '../../lib/api.js';
import styles from './SandboxPanel.module.css';
import { SessionPicker } from './SessionPicker.js';

// ---- State ----

interface State {
  sandboxes: SandboxSummary[];
  selectedSandbox: string | null;
  loading: boolean;
  error: string | null;
  actionInProgress: string | null;
  clearing: boolean;
}

type Action =
  | { type: 'SET_SANDBOXES'; sandboxes: SandboxSummary[] }
  | { type: 'SET_SELECTED'; id: string | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_ACTION'; id: string | null }
  | { type: 'SET_CLEARING'; clearing: boolean };

const INITIAL: State = {
  sandboxes: [],
  selectedSandbox: null,
  loading: false,
  error: null,
  actionInProgress: null,
  clearing: false,
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
    case 'SET_CLEARING':
      return { ...state, clearing: action.clearing };
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
  const [activeTab, setActiveTab] = useState<'agents' | 'tasks'>('agents');

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

  const handleForgetSandbox = useCallback(async (id: string) => {
    try {
      await api.forgetSandbox(id);
      const data = await api.sandboxes();
      dispatch({ type: 'SET_SANDBOXES', sandboxes: data.sandboxes });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Delete failed: ${err}` });
    }
  }, []);

  const handleClearOffline = useCallback(async () => {
    dispatch({ type: 'SET_CLEARING', clearing: true });
    try {
      await api.clearOfflineSandboxes();
      // Poll immediately to refresh list
      const data = await api.sandboxes();
      dispatch({ type: 'SET_SANDBOXES', sandboxes: data.sandboxes });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: `Clear failed: ${err}` });
    } finally {
      dispatch({ type: 'SET_CLEARING', clearing: false });
    }
  }, []);

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
        <div className={styles.sidebarHeader}>
          <h3 className={styles.sidebarTitle}>Sandboxes</h3>
          {state.sandboxes.some(s => !s.connected) && (
            <button
              type="button"
              className={styles.clearOfflineBtn}
              onClick={handleClearOffline}
              disabled={state.clearing}
              title="Remove all disconnected sandboxes to force re-registration"
            >
              {state.clearing ? 'Clearing…' : 'Clear Offline'}
            </button>
          )}
        </div>
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
              <li key={s.id} className={styles.sandboxRow}>
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
                <button
                  type="button"
                  className={styles.sandboxDeleteBtn}
                  onClick={(e) => { e.stopPropagation(); handleForgetSandbox(s.id); }}
                  title="Remove this sandbox from the registry"
                  aria-label={`Remove ${s.name}`}
                >
                  ✕
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

            {/* Tab bar */}
            <div className={styles.tabBar} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'agents'}
                className={activeTab === 'agents' ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab('agents')}
              >
                Agents
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'tasks'}
                className={activeTab === 'tasks' ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab('tasks')}
              >
                Tasks
              </button>
            </div>

            {/* Agent grid */}
            {activeTab === 'agents' && (
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
            )}

            {/* Tasks panel */}
            {activeTab === 'tasks' && (
              <SandboxTasksView
                sandboxId={selectedSandbox.id}
                connected={selectedSandbox.connected}
              />
            )}

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

// ---- Sandbox Tasks View (#907) ----

const TASK_STATE_COLORS: Record<string, string> = {
  pending: '#ff9800',
  running: '#2196f3',
  completed: '#4caf50',
  failed: '#f44336',
  cancelled: '#555',
};

function taskStateBadge(state: string) {
  return (
    <span
      className={styles.statusDot}
      style={{ background: TASK_STATE_COLORS[state] ?? '#888' }}
      title={state}
      aria-label={`State: ${state}`}
    />
  );
}

function SandboxTasksView({ sandboxId, connected }: { sandboxId: string; connected: boolean }) {
  const [tasks, setTasks] = useState<SandboxTask[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [manifest, setManifest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Poll task list
  useEffect(() => {
    if (!connected) return;
    let active = true;
    async function poll() {
      try {
        const data = await api.sandboxTasks(sandboxId);
        if (active) { setTasks(data.tasks); setTotal(data.total_count); setError(null); }
      } catch (e) {
        if (active) setError(String(e));
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, [sandboxId, connected]);

  const handleSubmit = useCallback(async () => {
    if (!manifest.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: SubmitTaskRequest = { manifest_yaml: manifest.trim() };
      await api.submitTask(sandboxId, body);
      setManifest('');
      setShowForm(false);
      // Refresh immediately
      const data = await api.sandboxTasks(sandboxId);
      setTasks(data.tasks);
      setTotal(data.total_count);
    } catch (e) {
      setSubmitError(`Submit failed: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }, [sandboxId, manifest]);

  const handleCancel = useCallback(async (taskId: string) => {
    try {
      await api.cancelTask(sandboxId, taskId);
      const data = await api.sandboxTasks(sandboxId);
      setTasks(data.tasks);
      setTotal(data.total_count);
    } catch (e) {
      setError(`Cancel failed: ${String(e)}`);
    }
  }, [sandboxId]);

  if (!connected) {
    return <div className={styles.emptyAgents}>Tasks unavailable while sandbox is offline</div>;
  }

  return (
    <div className={styles.tasksView}>
      <div className={styles.tasksHeader}>
        <span className={styles.tasksCount}>{total} task{total !== 1 ? 's' : ''}</span>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : 'New Task'}
        </button>
      </div>

      {showForm && (
        <div className={styles.taskForm}>
          <label className={styles.taskFormLabel} htmlFor="task-manifest">
            Task manifest (YAML)
          </label>
          <textarea
            id="task-manifest"
            className={styles.taskManifestInput}
            value={manifest}
            onChange={(e) => setManifest(e.target.value)}
            placeholder={`name: my-task\nagent: my-agent\ncommand: |\n  aiwg use sdlc && echo done`}
            rows={6}
            disabled={submitting}
          />
          {submitError && <div className={styles.error}>{submitError}</div>}
          <div className={styles.taskFormActions}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handleSubmit}
              disabled={submitting || !manifest.trim()}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {tasks.length === 0 ? (
        <div className={styles.emptyAgents}>No tasks. Use "New Task" to submit one.</div>
      ) : (
        <ul className={styles.taskList}>
          {tasks.map((task) => (
            <li key={task.id} className={styles.taskRow}>
              <div className={styles.taskRowHeader}>
                {taskStateBadge(task.state)}
                <strong className={styles.taskName}>{task.name}</strong>
                <span className={styles.taskState}>{task.state}</span>
                {task.vm_name && <span className={styles.taskMeta}>VM: {task.vm_name}</span>}
              </div>
              <div className={styles.taskRowMeta}>
                <span>Created {fmtTime(task.created_at)}</span>
                {task.progress.tool_calls > 0 && (
                  <span>{task.progress.tool_calls} tool calls</span>
                )}
                {task.progress.current_tool && (
                  <span>Running: {task.progress.current_tool}</span>
                )}
              </div>
              {task.error && <div className={styles.taskError}>{task.error}</div>}
              {(task.state === 'pending' || task.state === 'running') && (
                <button
                  type="button"
                  className={styles.actionBtnDanger}
                  onClick={() => handleCancel(task.id)}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
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
