/**
 * ScheduledTaskRunner — Bridges CronScheduler events to task execution.
 *
 * Listens for cron.fired events from EventRouter and submits tasks to the
 * DaemonSupervisor. Built-in actions map to predefined prompts; custom
 * actions use the job's `prompt` field.
 *
 * @implements Plan: Daemon Starter — Scheduled Task Runner
 */

import { EventEmitter } from 'events';

/**
 * Built-in action registry — maps action names to task prompts.
 * Users can override these or add custom actions with a `prompt` field
 * in their job config.
 */
const BUILTIN_ACTIONS = {
  doctor: {
    prompt: 'Run `aiwg doctor` and report any issues found. If there are issues, suggest fixes.',
    description: 'Health check',
  },
  'validate-metadata': {
    prompt: 'Run `aiwg validate-metadata` and report any validation errors in extension metadata.',
    description: 'Artifact metadata audit',
  },
  'doc-sync': {
    prompt: 'Run `aiwg doc-sync code-to-docs --dry-run` and report any documentation-code drift found.',
    description: 'Documentation sync check',
  },
  'test-sync': {
    prompt: 'Run `npm test` and report results. If any tests fail, identify the root cause.',
    description: 'Test suite execution',
  },
};

/**
 * @typedef {Object} ScheduledTaskRunnerOptions
 * @property {import('../ralph-external/daemon-supervisor.mjs').DaemonSupervisor} supervisor
 * @property {import('./event-router.mjs').default} eventRouter
 * @property {import('../messaging/room-manager.mjs').RoomManager} [roomManager]
 */

export class ScheduledTaskRunner extends EventEmitter {
  /** @type {import('../ralph-external/daemon-supervisor.mjs').DaemonSupervisor} */
  #supervisor;

  /** @type {import('./event-router.mjs').default} */
  #eventRouter;

  /** @type {import('../messaging/room-manager.mjs').RoomManager|null} */
  #roomManager;

  /** @type {Map<string, { action: string, lastRun: string|null, runCount: number }>} */
  #jobHistory = new Map();

  /** @type {boolean} */
  #started = false;

  /**
   * @param {ScheduledTaskRunnerOptions} options
   */
  constructor(options) {
    super();
    this.#supervisor = options.supervisor;
    this.#eventRouter = options.eventRouter;
    this.#roomManager = options.roomManager || null;
  }

  /**
   * Start listening for cron events.
   */
  start() {
    if (this.#started) return;
    this.#started = true;

    this.#eventRouter.on('event', (event) => {
      if (event.source === 'schedule' && event.type === 'cron.fired') {
        this.#handleCronEvent(event).catch(err => {
          console.error(`[scheduled-task-runner] Error handling cron event: ${err.message}`);
        });
      }
    });
  }

  /**
   * Stop the runner.
   */
  stop() {
    this.#started = false;
  }

  /**
   * Handle a cron.fired event by submitting a task.
   *
   * @param {Object} event
   */
  async #handleCronEvent(event) {
    const jobId = event.payload?.job_id || event.payload?.id;
    const action = event.payload?.action;
    const priority = event.payload?.priority ?? 1;

    if (!action) {
      console.warn(`[scheduled-task-runner] Cron event missing action: ${jobId}`);
      return;
    }

    const prompt = this.#resolvePrompt(action, event.payload);
    if (!prompt) {
      console.warn(`[scheduled-task-runner] Unknown action "${action}" for job ${jobId}`);
      return;
    }

    console.log(`[scheduled-task-runner] Executing job ${jobId}: ${action}`);

    try {
      const result = await this.#supervisor.submit({
        prompt,
        priority,
        metadata: {
          source: 'scheduler',
          jobId,
          action,
        },
      });

      // Track history
      this.#jobHistory.set(jobId, {
        action,
        lastRun: new Date().toISOString(),
        runCount: (this.#jobHistory.get(jobId)?.runCount || 0) + 1,
      });

      this.emit('job:submitted', { jobId, action, taskId: result?.loopId || result?.taskId });

      // Notify notification-purpose rooms
      if (this.#roomManager) {
        const rooms = this.#roomManager.getBroadcastRooms();
        if (rooms.length > 0) {
          this.emit('notify', {
            message: `Scheduled job "${jobId}" (${action}) submitted`,
            rooms,
          });
        }
      }
    } catch (error) {
      console.error(`[scheduled-task-runner] Failed to submit job ${jobId}: ${error.message}`);
      this.emit('job:failed', { jobId, action, error: error.message });
    }
  }

  /**
   * Resolve action name to a prompt string.
   *
   * @param {string} action
   * @param {Object} payload - Job payload (may contain custom `prompt`)
   * @returns {string|null}
   */
  #resolvePrompt(action, payload) {
    // Custom prompt in job config takes precedence
    if (payload?.prompt) {
      return payload.prompt;
    }

    // Built-in action
    const builtin = BUILTIN_ACTIONS[action];
    if (builtin) {
      return builtin.prompt;
    }

    return null;
  }

  /**
   * Register a custom action.
   *
   * @param {string} name
   * @param {Object} config
   * @param {string} config.prompt
   * @param {string} [config.description]
   */
  registerAction(name, config) {
    BUILTIN_ACTIONS[name] = config;
  }

  /**
   * Get job execution history.
   *
   * @returns {Object[]}
   */
  getHistory() {
    return [...this.#jobHistory.entries()].map(([jobId, info]) => ({
      jobId,
      ...info,
    }));
  }

  /**
   * Get status summary.
   *
   * @returns {Object}
   */
  getStatus() {
    return {
      started: this.#started,
      registeredActions: Object.keys(BUILTIN_ACTIONS),
      jobHistory: this.getHistory(),
    };
  }
}

export default ScheduledTaskRunner;
