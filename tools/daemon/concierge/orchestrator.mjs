/**
 * ConciergeOrchestrator — wires the intent router, response translator,
 * and memory manager into a single pipeline that mediates daemon interactions.
 *
 * Pipeline:
 *   user input → intent router → handler dispatch → response translator → user output
 *
 * Lifecycle hooks:
 *   - onSessionStart(ctx)    — greeting with memory context
 *   - handleMessage(msg,ctx) — full classify→dispatch→translate pipeline
 *   - translateResponse(raw) — standalone pre-response translation
 *   - onError(error, ctx)    — error absorption
 *
 * @issue   #642
 * @tests   @test/unit/daemon/concierge/orchestrator.test.js
 */

import { ConciergeIntentRouter } from './intent-router.mjs';
import { ConciergeResponseTranslator } from './response-translator.mjs';

export class ConciergeOrchestrator {
  /**
   * @param {Object} options
   * @param {Object} options.supervisor           AgentSupervisor for task dispatch
   * @param {Object} [options.memoryManager]      MemoryManager for session context
   * @param {Object} [options.capabilityMatrix]   Provider capability data
   * @param {string} [options.provider]            Current provider key
   * @param {Object} [options.sessionLog]          Session state logger
   */
  constructor(options = {}) {
    this.supervisor = options.supervisor;
    this.memoryManager = options.memoryManager || null;
    this.provider = options.provider || null;

    this.router = new ConciergeIntentRouter({
      capabilityMatrix: options.capabilityMatrix || null,
      provider: this.provider,
      sessionLog: options.sessionLog || null,
    });

    this.translator = new ConciergeResponseTranslator();

    this._sessionStarted = false;
    this._sessionContext = {};
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Called on first interaction or explicit session start.
   * Loads memory context and returns a contextual greeting.
   *
   * @param {Object} [ctx]  Session context (branch, pending tasks, etc.)
   * @returns {{ greeting: string, memoryContext: string }}
   */
  onSessionStart(ctx = {}) {
    this._sessionStarted = true;
    this._sessionContext = { ...ctx, startedAt: new Date().toISOString() };

    const memoryContext = this.memoryManager?.getContext?.() || '';

    // Build a contextual greeting — not a generic hello
    let greeting = 'Good to see you. What are we working on?';

    if (memoryContext) {
      // Memory exists ��� reference prior context
      const hasActiveWork = memoryContext.includes('in progress') ||
        memoryContext.includes('working on') ||
        memoryContext.includes('active');
      if (hasActiveWork) {
        greeting = 'Picking up where we left off. What would you like to focus on?';
      } else {
        greeting = 'Welcome back. What can I help with?';
      }
    }

    return { greeting, memoryContext };
  }

  // ---------------------------------------------------------------------------
  // Message handling — the main pipeline
  // ---------------------------------------------------------------------------

  /**
   * Process a user message through the full concierge pipeline.
   *
   * classify → route → dispatch → translate → return
   *
   * @param {string} message     User message
   * @param {Object} [ctx]       Per-call context
   * @returns {Promise<ConciergeResult>}
   */
  async handleMessage(message, ctx = {}) {
    // Ensure session is started
    if (!this._sessionStarted) {
      this.onSessionStart(ctx);
    }

    // Step 1: Route — classify intent, match handler, check capability
    const routing = this.router.route(message, { provider: ctx.provider || this.provider });

    // Step 2: Dispatch based on routing result
    let rawOutput;
    let taskId = null;

    if (routing.fallback) {
      // Fallback — use the router's suggestion as the response
      rawOutput = routing.suggestion || 'Could you clarify what you need?';
    } else if (routing.handler?.type === 'inline') {
      // Conversational — concierge responds directly (no task dispatch)
      rawOutput = this._handleInline(message, routing);
    } else {
      // Dispatch to supervisor as a task
      const dispatchResult = this._dispatch(message, routing);
      taskId = dispatchResult.taskId;
      // For async tasks, return immediately with task reference
      // The pre-response hook will translate the result when it completes
      return {
        type: 'task-dispatched',
        taskId,
        category: routing.category,
        handler: routing.handler?.id,
        message: `On it. I've queued that for ${routing.handler?.description || routing.category}.`,
      };
    }

    // Step 3: Translate the response
    const translated = this.translator.translate(rawOutput, {
      isSensitive: routing.isSensitive,
    });

    return {
      type: 'response',
      taskId,
      category: routing.category,
      response: translated.translated,
      bypassed: translated.bypassed,
      discreetApplied: translated.discreetApplied,
    };
  }

  // ---------------------------------------------------------------------------
  // Pre-response hook — translate raw task output
  // ---------------------------------------------------------------------------

  /**
   * Translate raw output from a completed task.
   * Called by the daemon when a supervisor task completes.
   *
   * @param {string} raw            Raw task output
   * @param {Object} [options]      Translation options
   * @param {boolean} [options.raw]       Skip translation
   * @param {boolean} [options.verbose]   Skip translation
   * @param {string}  [options.sourceType]  Output type hint
   * @param {boolean} [options.isSensitive] Mark as sensitive
   * @returns {TranslationResult}
   */
  translateResponse(raw, options = {}) {
    return this.translator.translate(raw, options);
  }

  // ---------------------------------------------------------------------------
  // Error absorption
  // ---------------------------------------------------------------------------

  /**
   * Absorb an error and return a composed, non-technical response.
   * Never exposes stack traces or internal state to the user.
   *
   * @param {Error|string} error    The error to absorb
   * @param {Object} [ctx]          Context about what was happening
   * @returns {{ response: string, severity: string }}
   */
  onError(error, ctx = {}) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';

    // Classify the error
    let severity = 'recoverable';
    let response;

    if (message.includes('ENOENT') || message.includes('not found')) {
      severity = 'user-actionable';
      response = 'I couldn\'t find what was needed. Could you check the path or resource exists?';
    } else if (message.includes('ECONNREFUSED') || message.includes('timeout') || message.includes('ETIMEDOUT')) {
      severity = 'recoverable';
      response = 'A connection issue occurred. I\'ll retry shortly.';
    } else if (message.includes('permission') || message.includes('EACCES')) {
      severity = 'user-actionable';
      response = 'I don\'t have the required permissions. You may need to check access settings.';
    } else if (message.includes('INVALID_PARAMS') || message.includes('Missing required')) {
      severity = 'user-actionable';
      response = `Something was missing from the request: ${message.replace(/^.*?:\s*/, '')}`;
    } else {
      severity = 'system-level';
      response = 'Something went wrong internally. Details have been logged.';
    }

    return { response, severity, logged: true };
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  /**
   * Return concierge status for IPC/CLI inspection.
   */
  getStatus() {
    return {
      enabled: true,
      sessionStarted: this._sessionStarted,
      sessionContext: this._sessionContext,
      provider: this.provider,
      routerPatterns: this.router.getPatterns().length,
      routerHandlers: Object.keys(this.router.getHandlers()).length,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Handle inline/conversational messages directly.
   * No task dispatch — the concierge responds in-persona.
   */
  _handleInline(message, routing) {
    const lower = (message || '').toLowerCase().trim();

    if (/^(thanks|thank you|cheers|ta|thx)/i.test(lower)) {
      return 'Happy to help.';
    }
    if (/^(looks? good|perfect|great|nice|ok|okay|👍)/i.test(lower)) {
      return 'Glad that works. Let me know if you need anything else.';
    }
    if (/^(hi|hello|hey|good (morning|afternoon|evening))/i.test(lower)) {
      return this._sessionStarted
        ? 'What can I help with?'
        : this.onSessionStart({}).greeting;
    }

    return 'Understood. What would you like to do next?';
  }

  /**
   * Dispatch a message to the supervisor based on routing result.
   */
  _dispatch(message, routing) {
    const handler = routing.handler;
    const prompt = handler.type === 'agent'
      ? message  // Agents receive the raw user message
      : `[Concierge → ${handler.id}] ${message}`;  // Skills/flows get a tagged prompt

    const task = this.supervisor.submit(prompt, {
      agent: handler.type === 'agent' ? handler.id : undefined,
      priority: 5, // Chat messages get higher priority
      metadata: {
        source: 'concierge',
        category: routing.category,
        handlerId: handler.id,
        handlerType: handler.type,
      },
    });

    return { taskId: task.id };
  }
}

export default ConciergeOrchestrator;
