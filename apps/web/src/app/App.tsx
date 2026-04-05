/**
 * AIWG Dashboard root application.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │  Header — nav tabs: Terminal | Missions   │
 *   ├──────────────────────────────────────────┤
 *   │  Main area (tab content)                  │
 *   └──────────────────────────────────────────┘
 */

import { useState } from 'react';
import { Terminal } from '../features/terminal/Terminal.js';
import { SessionSelector } from '../features/terminal/SessionSelector.js';
import styles from './App.module.css';

type Tab = 'terminal' | 'missions';

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
          <button
            type="button"
            className={tab === 'terminal' ? styles.active : ''}
            onClick={() => setTab('terminal')}
            aria-current={tab === 'terminal' ? 'page' : undefined}
          >
            Terminal
          </button>
          <button
            type="button"
            className={tab === 'missions' ? styles.active : ''}
            onClick={() => setTab('missions')}
            aria-current={tab === 'missions' ? 'page' : undefined}
          >
            Missions
          </button>
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
        {tab === 'missions' && (
          <section className={styles.placeholder} aria-label="Mission Control">
            <h2>Mission Control</h2>
            <p>Mission Control panel coming in #715.</p>
          </section>
        )}
      </main>
    </div>
  );
}
