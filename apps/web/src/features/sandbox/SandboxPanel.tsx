/**
 * Sandbox Operator Panel
 *
 * Visual interface for managing agentic-sandbox instances: view registered
 * sandboxes, agent inventory, loadout details, and lifecycle controls
 * (provision, start, stop, reprovision, destroy).
 *
 * @issue #733
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { api, type SandboxSummary, type SandboxAgent, type SandboxTask, type SubmitTaskRequest, type AiwgExecRequest, type AiwgExecResponse, type AgentCandidate, type Loadout } from '../../lib/api.js';
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
  const [activeTab, setActiveTab] = useState<'agents' | 'tasks' | 'remote'>('agents');
  const [showProvisionModal, setShowProvisionModal] = useState(false);

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
            {/* Provision modal (#915) */}
            {showProvisionModal && selectedSandbox.connected && (
              <ProvisionModal
                sandboxId={selectedSandbox.id}
                onClose={() => setShowProvisionModal(false)}
                onProvisioned={() => {
                  // Poll will pick up the new agent automatically
                }}
              />
            )}

            {/* Sandbox header */}
            <div className={styles.sandboxHeader}>
              <h2 className={styles.sandboxTitle}>
                {statusBadge(selectedSandbox.connected ? 'ready' : 'disconnected')}
                {selectedSandbox.name}
                {!selectedSandbox.connected && (
                  <span className={styles.offlineBadge}>offline</span>
                )}
              </h2>
              <div className={styles.sandboxHeaderActions}>
                {selectedSandbox.connected && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setShowProvisionModal(true)}
                    title="Provision a new agent VM on this sandbox"
                  >
                    Provision VM
                  </button>
                )}
              </div>
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
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'remote'}
                className={activeTab === 'remote' ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab('remote')}
              >
                Remote
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

            {/* Remote AIWG panel */}
            {activeTab === 'remote' && (
              <RemoteAiwgPanel
                sandboxId={selectedSandbox.id}
                agents={selectedSandbox.agents}
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

// ---- Metric Bar (#911) ----

function MetricBar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct >= 90 ? '#f44336' : pct >= 70 ? '#ff9800' : '#4caf50';
  return (
    <div className={styles.metricBar}>
      <span className={styles.metricLabel}>{label}</span>
      <div className={styles.metricTrack}>
        <div className={styles.metricFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.metricValue}>{value}{unit}</span>
    </div>
  );
}

// ---- Remote AIWG Panel (#914) ----

const AIWG_QUICK_COMMANDS: Array<{ label: string; subcommand: string; args?: string[] }> = [
  { label: 'Doctor', subcommand: 'doctor', args: ['--json'] },
  { label: 'Status', subcommand: 'status' },
  { label: 'Sync (dry run)', subcommand: 'sync', args: ['--dry-run'] },
  { label: 'Version', subcommand: 'version' },
];

function RemoteAiwgPanel({
  sandboxId,
  agents,
  connected,
}: { sandboxId: string; agents: SandboxAgent[]; connected: boolean }) {
  const [selectedAgent, setSelectedAgent] = useState(agents[0]?.agentId ?? '');
  const [subcommand, setSubcommand] = useState('doctor');
  const [args, setArgs] = useState('--json');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AiwgExecResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  const handleRun = useCallback(async () => {
    if (!selectedAgent || !subcommand.trim()) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const body: AiwgExecRequest = {
        subcommand: subcommand.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        timeout: 30,
      };
      const res = await api.aiwgExec(sandboxId, selectedAgent, body);
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, [sandboxId, selectedAgent, subcommand, args]);

  if (!connected) {
    return <div className={styles.emptyAgents}>Remote AIWG unavailable while sandbox is offline</div>;
  }

  return (
    <div className={styles.remotePanel}>
      <div className={styles.remoteForm}>
        <div className={styles.remoteRow}>
          <label className={styles.remoteLabel}>Agent</label>
          <select
            className={styles.remoteSelect}
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>{a.agentId}</option>
            ))}
          </select>
        </div>
        <div className={styles.remoteRow}>
          <label className={styles.remoteLabel}>Subcommand</label>
          <input
            className={styles.remoteInput}
            value={subcommand}
            onChange={(e) => setSubcommand(e.target.value)}
            placeholder="doctor"
          />
        </div>
        <div className={styles.remoteRow}>
          <label className={styles.remoteLabel}>Args</label>
          <input
            className={styles.remoteInput}
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder="--json"
          />
        </div>
        <div className={styles.remoteQuickBtns}>
          {AIWG_QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd.label}
              type="button"
              className={styles.actionBtnSecondary}
              disabled={running}
              onClick={() => { setSubcommand(cmd.subcommand); setArgs((cmd.args ?? []).join(' ')); }}
            >
              {cmd.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleRun}
          disabled={running || !selectedAgent || !subcommand.trim()}
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {result && (
        <div className={styles.remoteOutput}>
          <div className={styles.remoteOutputHeader}>
            Exit code: <strong style={{ color: result.exit_code === 0 ? '#4caf50' : '#f44336' }}>{result.exit_code}</strong>
          </div>
          {result.stdout && (
            <pre ref={outputRef} className={styles.remoteOutputPre}>{result.stdout}</pre>
          )}
          {result.stderr && (
            <pre className={styles.remoteOutputErr}>{result.stderr}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Provision Modal (#915) ----

const COMMON_PACKAGES = ['poetry', 'pre-commit', 'semgrep', 'trivy', 'bandit', 'httpie', 'jq', 'gh'];
const KNOWN_FRAMEWORKS = ['sdlc-complete', 'forensics-complete', 'media-marketing-kit', 'research-complete'];

function ProvisionModal({
  sandboxId,
  onClose,
  onProvisioned,
}: { sandboxId: string; onClose: () => void; onProvisioned: () => void }) {
  const [loadouts, setLoadouts] = useState<Loadout[]>([]);
  const [vmName, setVmName] = useState('');
  const [selectedLoadout, setSelectedLoadout] = useState('');
  const [addPackages, setAddPackages] = useState<string[]>([]);
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.sandboxLoadouts(sandboxId)
      .then((ls) => {
        setLoadouts(ls);
        if (ls.length > 0) setSelectedLoadout(ls[0].name);
      })
      .catch(() => { /* loadouts unavailable */ });
  }, [sandboxId]);

  const togglePackage = (pkg: string) =>
    setAddPackages((prev) => prev.includes(pkg) ? prev.filter((p) => p !== pkg) : [...prev, pkg]);

  const toggleFramework = (fw: string) =>
    setFrameworks((prev) => prev.includes(fw) ? prev.filter((f) => f !== fw) : [...prev, fw]);

  const handleProvision = useCallback(async () => {
    if (!vmName.trim() || !selectedLoadout) return;
    setProvisioning(true);
    setError(null);
    try {
      await api.sandboxProvision(sandboxId, {
        name: vmName.trim(),
        loadout: selectedLoadout,
        overrides: {
          ...(addPackages.length > 0 ? { add_packages: addPackages } : {}),
          ...(frameworks.length > 0 ? { aiwg_frameworks: frameworks } : {}),
        },
      });
      onProvisioned();
      onClose();
    } catch (e) {
      setError(`Provision failed: ${String(e)}`);
    } finally {
      setProvisioning(false);
    }
  }, [sandboxId, vmName, selectedLoadout, addPackages, frameworks, onProvisioned, onClose]);

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Provision VM">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Provision New Agent VM</h3>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.provisionFormRow}>
            <label className={styles.provisionLabel}>VM Name</label>
            <input
              className={styles.remoteInput}
              value={vmName}
              onChange={(e) => setVmName(e.target.value)}
              placeholder="agent-01"
              autoFocus
            />
          </div>
          <div className={styles.provisionFormRow}>
            <label className={styles.provisionLabel}>Base Loadout</label>
            <select
              className={styles.remoteSelect}
              value={selectedLoadout}
              onChange={(e) => setSelectedLoadout(e.target.value)}
            >
              {loadouts.length === 0
                ? <option value="">No loadouts available</option>
                : loadouts.map((l) => (
                    <option key={l.name} value={l.name}>{l.name}{l.description ? ` — ${l.description}` : ''}</option>
                  ))
              }
            </select>
          </div>
          <div className={styles.provisionSection}>
            <div className={styles.provisionSectionLabel}>Extra Packages</div>
            <div className={styles.provisionCheckboxGrid}>
              {COMMON_PACKAGES.map((pkg) => (
                <label key={pkg} className={styles.provisionCheckbox}>
                  <input type="checkbox" checked={addPackages.includes(pkg)} onChange={() => togglePackage(pkg)} />
                  {pkg}
                </label>
              ))}
            </div>
          </div>
          <div className={styles.provisionSection}>
            <div className={styles.provisionSectionLabel}>AIWG Frameworks</div>
            <div className={styles.provisionCheckboxGrid}>
              {KNOWN_FRAMEWORKS.map((fw) => (
                <label key={fw} className={styles.provisionCheckbox}>
                  <input type="checkbox" checked={frameworks.includes(fw)} onChange={() => toggleFramework(fw)} />
                  {fw}
                </label>
              ))}
            </div>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.actionBtnSecondary} onClick={onClose} disabled={provisioning}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleProvision}
            disabled={provisioning || !vmName.trim() || !selectedLoadout}
          >
            {provisioning ? 'Provisioning…' : 'Provision'}
          </button>
        </div>
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
  const [candidates, setCandidates] = useState<AgentCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string>('');

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

  // Load routing candidates when form opens (#916)
  useEffect(() => {
    if (!showForm) { setCandidates([]); setSelectedCandidate(''); return; }
    api.routingCandidates({ sandbox_id: sandboxId })
      .then((r) => {
        setCandidates(r.candidates);
        if (r.selected) setSelectedCandidate(r.selected.agent.agentId);
      })
      .catch(() => { /* routing preview is best-effort */ });
  }, [showForm, sandboxId]);

  const handleSubmit = useCallback(async () => {
    if (!manifest.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: SubmitTaskRequest = {
        manifest_yaml: manifest.trim(),
        ...(selectedCandidate ? { agent_filter: { agent_id: selectedCandidate } } : {}),
      };
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
  }, [sandboxId, manifest, selectedCandidate]);

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
          {/* Candidate agent selector (#916) */}
          {candidates.length > 0 && (
            <div className={styles.candidateRow}>
              <label className={styles.taskFormLabel} htmlFor="task-agent">
                Route to agent
              </label>
              <select
                id="task-agent"
                className={styles.remoteSelect}
                value={selectedCandidate}
                onChange={(e) => setSelectedCandidate(e.target.value)}
              >
                <option value="">Auto-select (best match)</option>
                {candidates.map((c) => (
                  <option key={c.agent.agentId} value={c.agent.agentId}>
                    {c.agent.logicalName ?? c.agent.agentId}
                    {c.agent.latestMetrics ? ` — CPU ${c.agent.latestMetrics.cpu_percent.toFixed(0)}%` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            <span
              key={fw.name}
              className={styles.fwBadge}
              title={`Providers: ${fw.providers.join(', ')}${fw.version ? ` · v${fw.version}` : ''}`}
            >
              {fw.name}{fw.version && <span className={styles.fwVersion}> v{fw.version}</span>}
            </span>
          ))}
        </div>
      )}

      {/* Metrics bars (#911) */}
      {agent.latestMetrics && (
        <div className={styles.metricsRow}>
          <MetricBar
            label="CPU"
            value={agent.latestMetrics.cpu_percent}
            max={100}
            unit="%"
          />
          {agent.latestMetrics.memory_total_bytes > 0 && (
            <MetricBar
              label="Mem"
              value={Math.round(agent.latestMetrics.memory_used_bytes / 1024 / 1024)}
              max={Math.round(agent.latestMetrics.memory_total_bytes / 1024 / 1024)}
              unit="MB"
            />
          )}
        </div>
      )}

      {/* Provisioning step (#911) */}
      {agent.status === 'provisioning' && agent.provisioningStep && (
        <div className={[styles.provisioningStep, agent.provisioningStalled ? styles.provisioningStalled : ''].join(' ')}>
          <span className={styles.provisioningLabel}>
            {agent.provisioningStalled ? '⚠ stalled: ' : ''}
            {agent.provisioningStep.step}
          </span>
          {agent.provisioningStep.total_steps !== undefined && agent.provisioningStep.step_index !== undefined && (
            <span className={styles.provisioningProgress}>
              {agent.provisioningStep.step_index + 1}/{agent.provisioningStep.total_steps}
            </span>
          )}
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
