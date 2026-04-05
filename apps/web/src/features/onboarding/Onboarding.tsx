/**
 * Novice onboarding UX — guided first task flow.
 *
 * Shown on first visit (tracked in localStorage). Walks the user through
 * building and launching their first aiwg task without reading docs.
 *
 * Flow: Welcome → Task builder → Launch + watch → Completion
 *
 * @issue #718
 */

import { useState, useCallback } from 'react';
import { Terminal } from '../terminal/Terminal.js';
import styles from './Onboarding.module.css';

const STORAGE_KEY = 'aiwg_onboarding_complete';
const SESSION_ID = 'onboarding';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Step = 'welcome' | 'builder' | 'launch' | 'complete';

const TASK_EXAMPLES = [
  'Fix all failing tests',
  'Add TypeScript types to src/',
  'Fix all lint errors',
  'Migrate src/ to ESM',
];

const COMPLETION_PRESETS = [
  { label: 'npm test passes', value: 'npm test' },
  { label: 'npx tsc --noEmit exits 0', value: 'npx tsc --noEmit' },
  { label: 'npm run lint exits 0', value: 'npm run lint' },
  { label: 'Custom command…', value: '' },
];

export function isFirstVisit(): boolean {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // localStorage unavailable
  }
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

interface WelcomeProps {
  onStart: () => void;
  onSkip: () => void;
}

function WelcomeScreen({ onStart, onSkip }: WelcomeProps) {
  return (
    <div className={styles.card}>
      <div className={styles.logo} aria-hidden="true">⚙</div>
      <h1 className={styles.heading}>Welcome to AIWG</h1>
      <p className={styles.tagline}>
        AIWG runs AI agents on your codebase. Tell it what to fix — it iterates until done.
      </p>
      <button type="button" className={styles.primaryBtn} onClick={onStart}>
        Start my first task →
      </button>
      <button type="button" className={styles.skipLink} onClick={onSkip}>
        Skip — take me to the dashboard
      </button>
    </div>
  );
}

interface BuilderProps {
  task: string;
  onTaskChange: (v: string) => void;
  completionCmd: string;
  onCompletionChange: (v: string) => void;
  maxIterations: number;
  onMaxIterChange: (v: number) => void;
  branch: string;
  onBranchChange: (v: string) => void;
  onLaunch: () => void;
  launching: boolean;
  error: string | null;
}

function TaskBuilder({
  task, onTaskChange,
  completionCmd, onCompletionChange,
  maxIterations, onMaxIterChange,
  branch, onBranchChange,
  onLaunch, launching, error,
}: BuilderProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [completionPreset, setCompletionPreset] = useState(COMPLETION_PRESETS[0].value);
  const [customCompletion, setCustomCompletion] = useState('');

  const handlePresetChange = (preset: string) => {
    setCompletionPreset(preset);
    if (preset !== '') {
      onCompletionChange(preset);
    } else {
      onCompletionChange(customCompletion);
    }
  };

  const handleCustomChange = (v: string) => {
    setCustomCompletion(v);
    if (completionPreset === '') {
      onCompletionChange(v);
    }
  };

  const isCustom = completionPreset === '';
  void completionCmd; // used via onCompletionChange

  return (
    <div className={styles.card}>
      <h2 className={styles.heading}>What do you want to fix?</h2>

      {error && (
        <div className={styles.error} role="alert">{error}</div>
      )}

      <label htmlFor="ob-task" className={styles.label}>Describe the task</label>
      <textarea
        id="ob-task"
        className={styles.textarea}
        value={task}
        onChange={(e) => onTaskChange(e.target.value)}
        placeholder={TASK_EXAMPLES[Math.floor(Math.random() * TASK_EXAMPLES.length)]}
        rows={3}
        aria-required="true"
      />
      <p className={styles.examples} aria-label="Example tasks">
        {TASK_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className={styles.exampleChip}
            onClick={() => onTaskChange(ex)}
          >
            {ex}
          </button>
        ))}
      </p>

      <label htmlFor="ob-completion" className={styles.label}>How do I know it worked?</label>
      <select
        id="ob-completion"
        className={styles.select}
        value={completionPreset}
        onChange={(e) => handlePresetChange(e.target.value)}
      >
        {COMPLETION_PRESETS.map((p) => (
          <option key={p.label} value={p.value}>{p.label}</option>
        ))}
      </select>
      {isCustom && (
        <input
          type="text"
          className={styles.input}
          placeholder="e.g. ./check.sh exits 0"
          value={customCompletion}
          onChange={(e) => handleCustomChange(e.target.value)}
          aria-label="Custom completion command"
        />
      )}

      <details className={styles.advanced}>
        <summary
          className={styles.advancedToggle}
          onClick={(e) => { e.preventDefault(); setShowAdvanced(v => !v); }}
          aria-expanded={showAdvanced}
        >
          Advanced {showAdvanced ? '▲' : '▼'}
        </summary>
        {showAdvanced && (
          <div className={styles.advancedBody}>
            <label htmlFor="ob-maxiter" className={styles.label}>Max iterations</label>
            <input
              id="ob-maxiter"
              type="number"
              className={styles.inputSmall}
              min={1}
              max={20}
              value={maxIterations}
              onChange={(e) => onMaxIterChange(parseInt(e.target.value, 10) || 6)}
            />
            <label htmlFor="ob-branch" className={styles.label}>Branch name (optional)</label>
            <input
              id="ob-branch"
              type="text"
              className={styles.input}
              placeholder="fix/my-task"
              value={branch}
              onChange={(e) => onBranchChange(e.target.value)}
            />
          </div>
        )}
      </details>

      <button
        type="button"
        className={styles.primaryBtn}
        onClick={onLaunch}
        disabled={!task.trim() || launching}
      >
        {launching ? 'Launching…' : 'Launch task →'}
      </button>
    </div>
  );
}

interface LaunchProps {
  task: string;
  missionId: string;
  iteration: number;
  status: string;
  onComplete: () => void;
}

function LaunchWatch({ task, missionId: _missionId, iteration, status, onComplete }: LaunchProps) {
  return (
    <div className={styles.launchLayout}>
      <div className={styles.launchSidebar}>
        <h2 className={styles.launchTitle}>Running task</h2>
        <p className={styles.launchTask}>{task}</p>
        <div className={styles.launchStats}>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Status</span>
            <span className={styles.statValue}>{status || 'queued'}</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Pass</span>
            <span className={styles.statValue}>{iteration} of ~3</span>
          </div>
        </div>
        <p className={styles.launchHint}>
          Pass {iteration} of ~3 — watching output…
        </p>
        <button type="button" className={styles.secondaryBtn} onClick={onComplete}>
          Skip to completion →
        </button>
      </div>
      <div className={styles.launchTerminal}>
        <Terminal sessionId={SESSION_ID} readOnly />
      </div>
    </div>
  );
}

interface CompleteProps {
  task: string;
  passes: number;
  onTryAnother: () => void;
  onExploreDashboard: () => void;
}

function CompletionCard({ task, passes, onTryAnother, onExploreDashboard }: CompleteProps) {
  return (
    <div className={styles.card}>
      <div className={styles.celebration} aria-hidden="true">🎉</div>
      <h2 className={styles.heading}>Task complete!</h2>
      <p className={styles.tagline}>{task}</p>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>{passes}</span>
          <span className={styles.summaryLabel}>Passes taken</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryValue}>✓</span>
          <span className={styles.summaryLabel}>Quality gate</span>
        </div>
      </div>

      <div className={styles.completionActions}>
        <button type="button" className={styles.primaryBtn} onClick={onTryAnother}>
          Try another task
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onExploreDashboard}>
          Explore the dashboard
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [task, setTask] = useState('');
  const [completionCmd, setCompletionCmd] = useState(COMPLETION_PRESETS[0].value);
  const [maxIterations, setMaxIterations] = useState(6);
  const [branch, setBranch] = useState('');
  const [missionId, setMissionId] = useState('');
  const [iteration, setIteration] = useState(0);
  const [status, setStatus] = useState('');
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSkip = useCallback(() => {
    markOnboardingComplete();
    onComplete();
  }, [onComplete]);

  const handleLaunch = useCallback(async () => {
    if (!task.trim()) return;
    setLaunching(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { task, completion: completionCmd };
      if (maxIterations !== 6) body.maxIterations = maxIterations;
      if (branch) body.branch = branch;

      const res = await fetch(`/api/sessions/${SESSION_ID}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Dispatch failed: HTTP ${res.status}`);
      const data = await res.json() as { id: string; status: string };
      setMissionId(data.id);
      setStatus(data.status);
      setIteration(1);
      setStep('launch');
    } catch (err) {
      setError(String(err));
    } finally {
      setLaunching(false);
    }
  }, [task, completionCmd, maxIterations, branch]);

  const handleLaunchComplete = useCallback(() => {
    setStep('complete');
  }, []);

  const handleTryAnother = useCallback(() => {
    setTask('');
    setCompletionCmd(COMPLETION_PRESETS[0].value);
    setIteration(0);
    setStatus('');
    setStep('builder');
  }, []);

  const handleExploreDashboard = useCallback(() => {
    markOnboardingComplete();
    onComplete();
  }, [onComplete]);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="AIWG onboarding">
      <div className={styles.container}>
        {step === 'welcome' && (
          <WelcomeScreen
            onStart={() => setStep('builder')}
            onSkip={handleSkip}
          />
        )}
        {step === 'builder' && (
          <TaskBuilder
            task={task}
            onTaskChange={setTask}
            completionCmd={completionCmd}
            onCompletionChange={setCompletionCmd}
            maxIterations={maxIterations}
            onMaxIterChange={setMaxIterations}
            branch={branch}
            onBranchChange={setBranch}
            onLaunch={handleLaunch}
            launching={launching}
            error={error}
          />
        )}
        {step === 'launch' && (
          <LaunchWatch
            task={task}
            missionId={missionId}
            iteration={iteration}
            status={status}
            onComplete={handleLaunchComplete}
          />
        )}
        {step === 'complete' && (
          <CompletionCard
            task={task}
            passes={iteration}
            onTryAnother={handleTryAnother}
            onExploreDashboard={handleExploreDashboard}
          />
        )}
      </div>
    </div>
  );
}
