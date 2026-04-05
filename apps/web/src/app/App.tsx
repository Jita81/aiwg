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
import styles from './App.module.css';

type Tab = 'terminal' | 'missions' | 'telemetry' | 'memory';

export function App() {
  const [tab, setTab] = useState<Tab>('terminal');
  const [sessionId, setSessionId] = useState('default');
  const readOnly = new URLSearchParams(location.search).has('readonly');

  return (
    <div className={styles.app}>
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
        {tab === 'terminal' && (
          <div className={styles.sessionControl}>
            <SessionSelector selected={sessionId} onSelect={setSessionId} />
          </div>
        )}
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
