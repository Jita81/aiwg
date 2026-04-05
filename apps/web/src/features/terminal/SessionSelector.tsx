/**
 * Session selector dropdown for switching between active PTY sessions.
 */

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

interface SessionSelectorProps {
  selected: string;
  onSelect: (id: string) => void;
}

export function SessionSelector({ selected, onSelect }: SessionSelectorProps) {
  const [sessions, setSessions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const data = await api.sessions();
        if (active) setSessions(data.sessions);
      } catch {
        // server may not be ready yet — ignore
      }
    }

    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const all = sessions.includes(selected) ? sessions : [selected, ...sessions].filter(Boolean);

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span>Session:</span>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="Select PTY session"
        style={{
          background: '#1a1a1a',
          color: '#e0e0e0',
          border: '1px solid #3a3a3a',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 12,
        }}
      >
        {all.map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
        {all.length === 0 && <option value="">No active sessions</option>}
      </select>
    </label>
  );
}
