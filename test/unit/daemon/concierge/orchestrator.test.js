import { describe, it, expect, beforeEach, vi } from 'vitest';

const loadModule = async () => {
  const mod = await import('../../../../tools/daemon/concierge/orchestrator.mjs');
  return mod;
};

describe('ConciergeOrchestrator (#642)', () => {
  let ConciergeOrchestrator;
  let mockSupervisor;

  beforeEach(async () => {
    const mod = await loadModule();
    ConciergeOrchestrator = mod.ConciergeOrchestrator;
    mockSupervisor = {
      submit: vi.fn().mockReturnValue({ id: 'task-123', state: 'queued' }),
    };
  });

  describe('constructor', () => {
    it('should initialize with required options', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      expect(orch.supervisor).toBe(mockSupervisor);
      expect(orch.provider).toBeNull();
    });

    it('should accept optional memoryManager and provider', () => {
      const mm = { getContext: () => '' };
      const orch = new ConciergeOrchestrator({
        supervisor: mockSupervisor,
        memoryManager: mm,
        provider: 'claude-code',
      });
      expect(orch.memoryManager).toBe(mm);
      expect(orch.provider).toBe('claude-code');
    });
  });

  describe('onSessionStart', () => {
    it('should return a greeting with no memory', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = orch.onSessionStart();
      expect(result.greeting).toBeDefined();
      expect(typeof result.greeting).toBe('string');
      expect(result.memoryContext).toBe('');
    });

    it('should return contextual greeting with memory', () => {
      const mm = { getContext: () => 'Some project is in progress' };
      const orch = new ConciergeOrchestrator({
        supervisor: mockSupervisor,
        memoryManager: mm,
      });
      const result = orch.onSessionStart();
      expect(result.greeting).toContain('Picking up');
      expect(result.memoryContext).toContain('in progress');
    });

    it('should set sessionStarted flag', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      expect(orch._sessionStarted).toBe(false);
      orch.onSessionStart();
      expect(orch._sessionStarted).toBe(true);
    });
  });

  describe('handleMessage', () => {
    it('should handle conversational messages inline', async () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = await orch.handleMessage('thanks');
      expect(result.type).toBe('response');
      expect(result.category).toBe('conversational');
      expect(result.response).toBeDefined();
      expect(mockSupervisor.submit).not.toHaveBeenCalled();
    });

    it('should dispatch maintenance messages to supervisor', async () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = await orch.handleMessage('is aiwg up to date');
      expect(result.type).toBe('task-dispatched');
      expect(result.taskId).toBe('task-123');
      expect(result.category).toBe('maintenance');
      expect(mockSupervisor.submit).toHaveBeenCalledOnce();
    });

    it('should dispatch scheduling messages to supervisor', async () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = await orch.handleMessage('run tests every morning');
      expect(result.type).toBe('task-dispatched');
      expect(result.category).toBe('scheduling');
    });

    it('should auto-start session on first message', async () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      expect(orch._sessionStarted).toBe(false);
      await orch.handleMessage('hello');
      expect(orch._sessionStarted).toBe(true);
    });

    it('should handle fallback for low-confidence messages', async () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      // Short ambiguous message that might fall below threshold
      const result = await orch.handleMessage('hmm');
      expect(result.type).toBe('response');
      // Should not crash regardless of classification
    });
  });

  describe('translateResponse', () => {
    it('should translate raw output', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = orch.translateResponse('All 15 tests passed.\n0 failures.');
      expect(result.translated).toBeDefined();
      expect(result.bypassed).toBe(false);
    });

    it('should bypass with raw option', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const raw = 'some raw output';
      const result = orch.translateResponse(raw, { raw: true });
      expect(result.translated).toBe(raw);
      expect(result.bypassed).toBe(true);
    });
  });

  describe('onError', () => {
    it('should absorb ENOENT errors as user-actionable', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = orch.onError(new Error('ENOENT: file not found'));
      expect(result.severity).toBe('user-actionable');
      expect(result.response).not.toContain('ENOENT');
    });

    it('should absorb connection errors as recoverable', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = orch.onError(new Error('ECONNREFUSED'));
      expect(result.severity).toBe('recoverable');
    });

    it('should absorb permission errors as user-actionable', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = orch.onError(new Error('EACCES: permission denied'));
      expect(result.severity).toBe('user-actionable');
    });

    it('should absorb unknown errors as system-level', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = orch.onError(new Error('something bizarre'));
      expect(result.severity).toBe('system-level');
      expect(result.response).not.toContain('bizarre');
    });

    it('should handle string errors', () => {
      const orch = new ConciergeOrchestrator({ supervisor: mockSupervisor });
      const result = orch.onError('plain string error');
      expect(result.response).toBeDefined();
      expect(result.severity).toBe('system-level');
    });
  });

  describe('getStatus', () => {
    it('should return status summary', () => {
      const orch = new ConciergeOrchestrator({
        supervisor: mockSupervisor,
        provider: 'claude-code',
      });
      const status = orch.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.sessionStarted).toBe(false);
      expect(status.provider).toBe('claude-code');
      expect(status.routerPatterns).toBeGreaterThan(0);
      expect(status.routerHandlers).toBeGreaterThan(0);
    });
  });
});
