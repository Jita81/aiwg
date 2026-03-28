/**
 * ConciergeIntentRouter — classifies user intent and dispatches to the correct
 * AIWG skill, agent, or flow for the daemon Concierge.
 *
 * Pipeline: CLASSIFY → MATCH → CAPABILITY CHECK → DISPATCH → ABSORB
 *
 * Design:  v1 uses pattern-matching intent classification (prompt-based upgrade
 *          is a future enhancement). The router never exposes internal
 *          skill/agent names in user-facing output — only the result reaches
 *          the user. Routing decisions are logged to daemon session state for
 *          steward diagnostics.
 *
 * @issue   #606
 * @tests   @test/unit/daemon/concierge/intent-router.test.js
 */

// ---------------------------------------------------------------------------
// Intent category patterns
// ---------------------------------------------------------------------------

/**
 * Ordered list of categories, each with a set of regex patterns.
 * First match wins. 'conversational' is the catch-all fallback.
 */
const INTENT_PATTERNS = [
  {
    category: 'maintenance',
    patterns: [
      /\baiwg\s+(up\s+to\s+date|version|update|upgrade|sync|health|doctor|check)\b/i,
      /\b(health\s+check|doctor|is\s+aiwg|update\s+aiwg|check\s+for\s+updates?)\b/i,
      /\binstall(ation)?\s+(health|status)\b/i,
      /\bvalidate[\s-]?metadata\b/i,
      /\bcleanup\s+audit\b/i,
    ],
  },
  {
    category: 'scheduling',
    patterns: [
      /\b(run|execute|do|schedule|set\s+up|create)\s+.{0,40}\b(every|each|daily|weekly|morning|night|hour|minute|cron|recurring|interval)\b/i,
      /\b(cron|schedule|recurring|automation)\b/i,
      /\brun\s+.{0,30}\s+at\s+\d/i,
    ],
  },
  {
    category: 'agent-teams',
    patterns: [
      /\b(run|start|launch|kick\s+off|execute)\s+a?\s*(security|test|review|audit|analysis)\s*(team|squad|crew|group)?\b/i,
      /\bagent\s+team\b/i,
      /\bmulti.agent\b/i,
      /\b(security|compliance|performance)\s+review\b/i,
      /\bparallel\s+(agents?|review|execution)\b/i,
    ],
  },
  {
    category: 'query',
    patterns: [
      /\b(what|which|how|where|when|who|why|list|show|what'?s)\b.*\b(command|skill|agent|feature|option|available|install|use|work|mean)\b/i,
      /\b(help|how\s+do\s+i|how\s+to|can\s+(i|you|aiwg)|does\s+(it|aiwg)|what\s+is|explain)\b/i,
      /\b(aiwg\s+kb|knowledge\s+base|documentation|docs)\b/i,
      /\bwhat\s+(are|were|can)\s+.{3,30}\b(command|skill|agent|feature|option|available|install)\b/i,
      /\bhow\s+(does|do|can|should)\s+.{3,60}\b(work|function|run|operate|behave)\b/i,
    ],
  },
  {
    category: 'sdlc',
    patterns: [
      /\b(transition|move|start|begin|kick\s+off|enter)\s+(to\s+|into\s+)?(inception|elaboration|construction|transition|production)\b/i,
      /\b(project\s+status|phase\s+(gate|check|status)|iteration\s+\d+|sprint\s+\d+)\b/i,
      /\b(deploy(ment)?|release|rollout)\s+(to\s+)?(prod(uction)?|staging)\b/i,
      /\b(requirements?|architecture|sad|adr|test\s+plan|risk\s+register)\b/i,
      /\b(intake|onboard|handoff|retrospective|retro)\b/i,
      /\b(fix|address|resolve|work\s+on)\s+(issue|bug|ticket|#\d+)\b/i,
      /\baddress.issues?\b/i,
      /\b(run|start|execute)\s+(the\s+)?ralph\s+loop\b/i,
    ],
  },
  {
    category: 'conversational',
    patterns: [
      // Catch-all — always matches; must be last
      /.*/,
    ],
  },
];

// ---------------------------------------------------------------------------
// Default handler catalog (v1 — curated by category)
// ---------------------------------------------------------------------------

/**
 * Maps each intent category to its default handler descriptor.
 * Handler ids reference AIWG skills/agents/flows by their internal id.
 * The id is used for dispatch but never surfaced to the user.
 */
const DEFAULT_HANDLERS = {
  maintenance: {
    id: 'aiwg-steward',
    type: 'agent',
    description: 'AIWG installation health and self-maintenance',
    requires_feature: null,
  },
  scheduling: {
    id: 'schedule',
    type: 'skill',
    description: 'Recurring task scheduling',
    requires_feature: 'cron',
  },
  'agent-teams': {
    id: 'flow-security-review-cycle',
    type: 'flow',
    description: 'Multi-agent review and team coordination',
    requires_feature: 'agent_teams',
  },
  sdlc: {
    id: 'sdlc-complete',
    type: 'framework',
    description: 'SDLC phase workflows and project management',
    requires_feature: null,
  },
  query: {
    id: 'aiwg-kb',
    type: 'skill',
    description: 'AIWG knowledge base and help',
    requires_feature: null,
  },
  conversational: {
    id: 'concierge-inline',
    type: 'inline',
    description: 'Direct concierge response',
    requires_feature: null,
  },
};

// ---------------------------------------------------------------------------
// Sensitive operation categories for discreet logging
// ---------------------------------------------------------------------------

const SENSITIVE_CATEGORIES = new Set(['maintenance']);
const SENSITIVE_KEYWORDS = /\b(token|secret|key|credential|password|auth|cert(ificate)?|rotate)\b/i;

// ---------------------------------------------------------------------------
// ConciergeIntentRouter
// ---------------------------------------------------------------------------

export class ConciergeIntentRouter {
  /**
   * @param {Object} [options]
   * @param {Object|null} [options.capabilityMatrix]   Loaded capability matrix
   *   (from src/providers/capability-matrix.ts). If null, capability checks
   *   are skipped.
   * @param {Object|null} [options.catalog]           Installed catalog for
   *   semantic search (future v2 enhancement). Currently unused.
   * @param {Object|null} [options.sessionLog]        Session state logger.
   *   Must expose: log(entry: Object) => void
   * @param {number}      [options.confidenceThreshold=0.7]  Below this score,
   *   the router asks for clarification instead of dispatching.
   * @param {string|null} [options.provider]          Current provider key
   *   (e.g. 'claude-code'). Used for capability checks.
   */
  constructor({
    capabilityMatrix = null,
    catalog = null,
    sessionLog = null,
    confidenceThreshold = 0.7,
    provider = null,
  } = {}) {
    this._capabilityMatrix = capabilityMatrix;
    this._catalog = catalog;
    this._sessionLog = sessionLog;
    this.confidenceThreshold = confidenceThreshold;
    this.provider = provider;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Route a raw user message to the appropriate handler.
   *
   * Returns a routing result that the Concierge uses for dispatch.
   * Never exposes internal handler names to the caller directly — the
   * caller is responsible for keeping routing internals out of user output.
   *
   * @param {string} message        Raw user message
   * @param {Object} [ctx]          Optional per-call context overrides
   * @param {string} [ctx.provider] Override the instance-level provider
   * @returns {RoutingResult}
   */
  route(message, ctx = {}) {
    const provider = ctx.provider ?? this.provider;
    const { category, confidence } = this.classify(message);
    const isSensitive = this._isSensitive(message, category);

    if (confidence < this.confidenceThreshold) {
      const result = this._buildFallback(message, 'low-confidence', { category, confidence });
      this._logDecision({ message: isSensitive ? '[redacted]' : message, ...result, provider });
      return result;
    }

    const handler = this._matchHandler(category, message);

    if (!handler) {
      const result = this._buildFallback(message, 'no-handler', { category, confidence });
      this._logDecision({ message: isSensitive ? '[redacted]' : message, ...result, provider });
      return result;
    }

    const available = this._checkCapability(handler, provider);

    if (!available) {
      const result = this._buildFallback(message, 'capability-unavailable', {
        category,
        confidence,
        handler,
        provider,
      });
      this._logDecision({ message: isSensitive ? '[redacted]' : message, ...result, provider });
      return result;
    }

    const result = {
      ok: true,
      category,
      confidence,
      handler,
      provider,
      fallback: false,
      isSensitive,
    };

    this._logDecision({ message: isSensitive ? '[redacted]' : message, ...result });
    return result;
  }

  /**
   * Classify the user message into an intent category.
   *
   * Returns the category and a confidence score in [0, 1].
   * Confidence is 1.0 for a specific-category match, 0.5 for conversational.
   *
   * @param {string} message
   * @returns {{ category: string, confidence: number }}
   */
  classify(message) {
    if (!message || typeof message !== 'string') {
      return { category: 'conversational', confidence: 0.5 };
    }

    const normalized = message.trim();

    for (const { category, patterns } of INTENT_PATTERNS) {
      // Skip catch-all for primary classification pass
      if (category === 'conversational') continue;

      for (const pattern of patterns) {
        if (pattern.test(normalized)) {
          return { category, confidence: 1.0 };
        }
      }
    }

    return { category: 'conversational', confidence: 0.5 };
  }

  /**
   * Expose the pattern catalog for testing and introspection.
   * @returns {Array<{category: string, patterns: RegExp[]}>}
   */
  getPatterns() {
    return INTENT_PATTERNS.slice(0, -1); // exclude catch-all
  }

  /**
   * Expose the handler catalog for testing and introspection.
   * @returns {Record<string, Object>}
   */
  getHandlers() {
    return { ...DEFAULT_HANDLERS };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Find the best handler for the given category and message.
   * v1: returns the default catalog handler for the category.
   * v2: will do semantic search against the installed catalog.
   */
  _matchHandler(category, _message) {
    return DEFAULT_HANDLERS[category] ?? null;
  }

  /**
   * Check whether the handler's required feature is available on the provider.
   * Returns true if no capability matrix is configured or the handler has
   * no feature requirement.
   */
  _checkCapability(handler, provider) {
    if (!this._capabilityMatrix || !provider || !handler.requires_feature) {
      return true;
    }

    const caps = this._capabilityMatrix.providers?.[provider];
    if (!caps) return true;

    const feature = handler.requires_feature;
    const native = caps.native_features?.[feature];
    const emulated = caps.emulation?.[feature];

    return !!(native || (emulated && emulated !== null));
  }

  /**
   * Build a standardised fallback result.
   */
  _buildFallback(message, reason, details = {}) {
    return {
      ok: false,
      fallback: true,
      reason,
      category: details.category ?? 'unknown',
      confidence: details.confidence ?? 0,
      handler: null,
      provider: details.provider ?? null,
      isSensitive: this._isSensitive(message, details.category),
      // Suggestion for in-persona user response (never expose raw reason)
      suggestion: this._buildFallbackSuggestion(reason, details),
    };
  }

  /**
   * Build a user-friendly (in-persona) fallback suggestion.
   * These strings are consumed by the Concierge response layer — they are NOT
   * shown verbatim to the user; the Concierge applies tone rules before surfacing.
   */
  _buildFallbackSuggestion(reason, details) {
    switch (reason) {
      case 'low-confidence':
        return 'Could you clarify what you need? I want to make sure I route this correctly.';
      case 'no-handler':
        return `I don\'t have a handler for that category yet. Here\'s what I can help with: maintenance, scheduling, agent teams, SDLC workflows, and general questions.`;
      case 'capability-unavailable': {
        const feature = details.handler?.requires_feature;
        const provider = details.provider;
        return feature && provider
          ? `That feature (${feature}) isn\'t available on ${provider}. I can use AIWG emulation — would you like me to proceed that way?`
          : 'That capability isn\'t available in the current environment. Would you like to see alternatives?';
      }
      default:
        return 'I wasn\'t able to handle that request. Could you rephrase it?';
    }
  }

  /**
   * Determine if the message or category is sensitive (redact from logs).
   */
  _isSensitive(message, category) {
    if (SENSITIVE_CATEGORIES.has(category)) return false; // maintenance is not sensitive
    return typeof message === 'string' && SENSITIVE_KEYWORDS.test(message);
  }

  /**
   * Log the routing decision to the session log.
   * Log entries are consumed by the steward for diagnostics — never surfaced
   * directly to the user.
   */
  _logDecision(entry) {
    if (!this._sessionLog) return;

    try {
      this._sessionLog.log({
        source: 'concierge:intent-router',
        timestamp: new Date().toISOString(),
        ...entry,
      });
    } catch {
      // Non-fatal — logging failures must not disrupt routing
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { INTENT_PATTERNS, DEFAULT_HANDLERS };

/**
 * @typedef {Object} RoutingResult
 * @property {boolean}     ok           True when a handler was matched and is available
 * @property {string}      category     Classified intent category
 * @property {number}      confidence   Classification confidence [0, 1]
 * @property {Object|null} handler      Matched handler descriptor (or null on fallback)
 * @property {string|null} provider     Provider key used for capability check
 * @property {boolean}     fallback     True when ok=false and a fallback was triggered
 * @property {boolean}     isSensitive  True when message contains sensitive keywords
 * @property {string}      [reason]     Fallback reason (present when fallback=true)
 * @property {string}      [suggestion] In-persona fallback suggestion (when fallback=true)
 */
