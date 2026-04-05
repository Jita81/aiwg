/**
 * AIWG Dashboard root application.
 *
 * Tabs: Terminal | Missions | Telemetry | Memory
 */

import { useState } from 'react';
import { Terminal } from '../features/terminal/Terminal.js';
import { SessionSelector } from '../features/terminal/SessionSelector.js';
import { MissionControl } from '../features/missions/MissionControl.js';
import { TelemetryDashboard } from '../features/telemetry/TelemetryDashboard.js';
import { MemoryPanel } from '../features/memory/MemoryPanel.js';
import { Onboarding, isFirstVisit } from '../features/onboarding/Onboarding.js';
import styles from './App.module.css';

type Tab = 'terminal' | 'missions' | 'telemetry' | 'memory';

export function App() {
  const [tab, setTab] = useState<Tab>('missions');
  const [sessionId, setSessionId] = useState('default');
  const [showOnboarding, setShowOnboarding] = useState(isFirstVisit);
  const readOnly = new URLSearchParams(location.search).has('readonly');

  return (
    <div className={styles.app}>
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}
      <header className={styles.header} role="banner">
        <h1 className={styles.title}>
          <span aria-hidden="true">⚙</span> AIWG Dashboard
        </h1>
        <nav className={styles.nav} aria-label="Dashboard tabs">
          {(['terminal', 'missions', 'telemetry', 'memory'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? styles.active : ''}
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className={styles.headerRight}>
          {tab === 'terminal' && (
            <SessionSelector selected={sessionId} onSelect={setSessionId} />
          )}
          <button
            type="button"
            className={styles.newTaskBtn}
            onClick={() => setShowOnboarding(true)}
            aria-label="Launch a new task"
          >
            + New task
          </button>
        </div>
      </header>

      <main className={styles.main} role="main">
        {tab === 'terminal' && (
          <Terminal key={sessionId} sessionId={sessionId} readOnly={readOnly} />
        )}
        {tab === 'missions' && <MissionControl />}
        {tab === 'telemetry' && <TelemetryDashboard sessionId={sessionId} />}
        {tab === 'memory' && <MemoryPanel />}
      </main>
    </div>
  );
}
