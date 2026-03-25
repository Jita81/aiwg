/**
 * IPC method handlers for ops-toolset tools
 *
 * Registers 7 JSON-RPC methods on the daemon IPC server that expose
 * DaemonSupervisor governance as callable tools:
 *   daemon.process.list   — Running/queued loops with PID, status, timing
 *   daemon.process.kill   — Kill a loop's process group (-pid)
 *   daemon.resource.snapshot — System CPU, memory, load, uptime
 *   daemon.circuit.status — Circuit breaker state and failure count
 *   daemon.queue.inspect  — Queue depth, oldest entry, priority distribution
 *   daemon.loop.history   — Completed/failed loop summaries
 *   daemon.budget.remaining — Daily budget status
 *
 * @implements #518
 * @tests @test/integration/daemon-ipc-ops.test.mjs
 */

import os from 'node:os';

/**
 * Register ops-toolset IPC methods on an IPCServer.
 *
 * @param {import('./ipc-server.mjs').IPCServer} ipcServer
 * @param {import('../ralph-external/daemon-supervisor.mjs').DaemonSupervisor} daemonSupervisor
 * @param {object} [options]
 * @param {number} [options.historyLimit=200] - Max completed loop entries to retain
 * @returns {{ getHistory: () => Array }} accessor for test inspection
 */
export function registerOpsHandlers(ipcServer, daemonSupervisor, options = {}) {
  const historyLimit = options.historyLimit ?? 200;
  const completedHistory = [];
  const startTime = Date.now();

  // Track completed and failed loops for history
  daemonSupervisor.on('loop:completed', ({ loopId, taskId }) => {
    _pushHistory({
      loopId,
      taskId,
      outcome: 'completed',
      completedAt: new Date().toISOString(),
    });
  });

  daemonSupervisor.on('loop:failed', ({ loopId, error, permanent, reason }) => {
    _pushHistory({
      loopId,
      outcome: permanent ? 'permanently-failed' : 'failed',
      error: typeof error === 'string' ? error : error?.message || String(error),
      reason: reason || null,
      completedAt: new Date().toISOString(),
    });
  });

  function _pushHistory(entry) {
    completedHistory.push(entry);
    if (completedHistory.length > historyLimit) {
      completedHistory.shift();
    }
  }

  ipcServer.registerMethods({
    /**
     * List running and queued loops with PID, status, timing, iteration info.
     */
    'daemon.process.list': (params) => {
      const status = daemonSupervisor.status();
      const filter = params?.filter || 'all';

      const running = status.running.map((r) => ({
        loopId: r.loopId,
        pid: r.pid,
        status: 'running',
        startedAt: r.startedAt,
        elapsed: r.startedAt
          ? Date.now() - new Date(r.startedAt).getTime()
          : 0,
        taskId: r.taskId,
      }));

      const queued = status.queued.map((q) => ({
        loopId: q.loopId,
        status: 'queued',
        position: q.position,
        priority: q.priority,
        enqueuedAt: q.enqueuedAt,
      }));

      const failed = status.permanentlyFailed.map((id) => ({
        loopId: id,
        status: 'permanently-failed',
      }));

      if (filter === 'running') return running;
      if (filter === 'queued') return queued;
      if (filter === 'failed') return failed;
      return [...running, ...queued, ...failed];
    },

    /**
     * Kill a loop's entire process group.
     */
    'daemon.process.kill': (params) => {
      if (!params?.loopId) {
        const err = new Error('Missing required parameter: loopId');
        err.code = 'INVALID_PARAMS';
        throw err;
      }

      const signal = params.signal || 'SIGTERM';
      const validSignals = ['SIGTERM', 'SIGKILL', 'SIGINT'];
      if (!validSignals.includes(signal)) {
        const err = new Error(`Invalid signal: ${signal}. Must be one of: ${validSignals.join(', ')}`);
        err.code = 'INVALID_PARAMS';
        throw err;
      }

      const killed = daemonSupervisor.killProcessGroup(params.loopId, signal);
      return { killed, loopId: params.loopId, signal };
    },

    /**
     * System resource snapshot: CPU, memory, load average, queue depth, uptime.
     */
    'daemon.resource.snapshot': () => {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const loadAvg = os.loadavg();
      const cpus = os.cpus();

      // Calculate CPU usage from all cores
      let totalIdle = 0;
      let totalTick = 0;
      for (const cpu of cpus) {
        const { user, nice, sys, idle, irq } = cpu.times;
        totalTick += user + nice + sys + idle + irq;
        totalIdle += idle;
      }
      const cpuPercent = cpus.length > 0
        ? ((1 - totalIdle / totalTick) * 100).toFixed(1)
        : '0.0';

      const status = daemonSupervisor.status();

      return {
        cpu: {
          percent: parseFloat(cpuPercent),
          cores: cpus.length,
        },
        memory: {
          totalMb: Math.round(totalMem / 1024 / 1024),
          usedMb: Math.round((totalMem - freeMem) / 1024 / 1024),
          freeMb: Math.round(freeMem / 1024 / 1024),
          percentUsed: parseFloat(((1 - freeMem / totalMem) * 100).toFixed(1)),
        },
        loadAvg: {
          '1m': loadAvg[0],
          '5m': loadAvg[1],
          '15m': loadAvg[2],
        },
        queueDepth: status.queueDepth,
        uptime: Math.floor((Date.now() - startTime) / 1000),
      };
    },

    /**
     * Circuit breaker state: closed/open/half-open, failure count, cooldown.
     */
    'daemon.circuit.status': () => {
      return daemonSupervisor.circuitBreaker.getState();
    },

    /**
     * Queue inspection: depth, oldest entry, priority distribution.
     */
    'daemon.queue.inspect': () => {
      const status = daemonSupervisor.status();

      let oldest = null;
      const priorityDistribution = {};

      for (const entry of status.queued) {
        // Track oldest
        if (!oldest || entry.enqueuedAt < oldest) {
          oldest = entry.enqueuedAt;
        }
        // Priority distribution
        const pKey = String(entry.priority);
        priorityDistribution[pKey] = (priorityDistribution[pKey] || 0) + 1;
      }

      return {
        depth: status.queueDepth,
        maxDepth: status.queueMax,
        oldest,
        priorityDistribution,
        estimatedWaitMs: null, // No reliable estimate without historical throughput
      };
    },

    /**
     * Completed loop history: summaries with outcome, timing, cost.
     */
    'daemon.loop.history': (params) => {
      const limit = params?.limit ?? 20;
      // Return most recent first
      return completedHistory.slice(-limit).reverse();
    },

    /**
     * Daily budget status: limit, spent, remaining, percent used.
     */
    'daemon.budget.remaining': () => {
      const status = daemonSupervisor.status();

      const dailyLimit = status.budgetLimit;
      const spent = status.budgetUsed;
      const remaining = dailyLimit > 0 ? Math.max(0, dailyLimit - spent) : Infinity;
      const percentUsed = dailyLimit > 0
        ? parseFloat(((spent / dailyLimit) * 100).toFixed(1))
        : 0;

      return {
        dailyLimit,
        spent: parseFloat(spent.toFixed(4)),
        remaining: dailyLimit > 0 ? parseFloat(remaining.toFixed(4)) : 'unlimited',
        percentUsed,
        currency: 'USD',
      };
    },
  });

  // Return accessor for testing
  return {
    getHistory: () => completedHistory,
  };
}
