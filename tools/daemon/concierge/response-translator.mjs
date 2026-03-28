/**
 * ConciergeResponseTranslator — converts raw skill/agent/flow output into
 * composed, appropriately-toned replies for the daemon Concierge.
 *
 * Pipeline position:
 *   [ Skill / Agent / Flow ] → raw output
 *           ↓
 *   [ ResponseTranslator ]
 *     - Apply tone rules (prompt, pertinent, pleasant, professional, discreet)
 *     - Reduce technical noise (paths, stack traces, debug lines)
 *     - Reformat for audience
 *     - Preserve fidelity — no actionable information is silently dropped
 *           ↓
 *   [ User ]
 *
 * Bypass: callers may pass { raw: true } or { verbose: true } to skip
 * translation entirely (for debugging or power-user access).
 *
 * @issue   #607
 * @tests   @test/unit/daemon/concierge/response-translator.test.js
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Sensitive operation categories.
 * When raw output is classified as one of these, discreet mode is applied
 * automatically unless the caller explicitly requests verbose output.
 */
const SENSITIVE_OPERATION_CATEGORIES = new Set([
  'token-rotation',
  'credential-update',
  'security-finding',
  'key-management',
]);

/**
 * Patterns that identify sensitive content in raw output.
 * Matched lines are suppressed in discreet mode.
 */
const SENSITIVE_PATTERNS = [
  /\b(token|secret|api[_-]?key|password|credential|private[_-]?key|bearer)\s*[:=]\s*\S+/i,
  /eyJ[A-Za-z0-9_-]{10,}/,                    // JWT token shape
  /ghp_[A-Za-z0-9]{36}/,                      // GitHub PAT
  /sk-[A-Za-z0-9]{32,}/,                      // OpenAI key shape
  /\b[0-9a-f]{40}\b/,                          // 40-char hex (token/hash)
];

/**
 * Patterns that indicate technical noise to suppress by default.
 */
const NOISE_PATTERNS = [
  /^\s+at\s+\S+\s+\(\S+:\d+:\d+\)/m,          // JS stack frame
  /^\s+at\s+\S+:\d+:\d+$/m,                   // Node stack frame (no parens)
  /^(node|npm|yarn|pnpm):.*error/im,          // Toolchain noise
  /\bDEBUG\b.*:/i,                            // Debug log lines
  /\bTRACE\b.*:/i,                            // Trace log lines
  /^\[.*\]\s*(debug|trace|verbose)\b/im,      // Structured debug/trace entries
];

/**
 * Absolute file paths that should be redacted in discreet mode.
 * Replaced with a short placeholder.
 */
const PATH_PATTERN = /(?:\/(?:home|Users|root|tmp|var|opt|mnt|srv|etc|usr|private)\S+|[A-Z]:[\\\/]\S+)/g;

/**
 * Filler phrases that violate the "pertinent" tone rule.
 * Stripped from translated output.
 */
const FILLER_PHRASES = [
  /\bi have\s+(successfully|just|now)\s+/gi,
  /\bas\s+you\s+requested[,.]?\s*/gi,
  /\bcertainly[!,.]?\s*/gi,
  /\bof\s+course[!,.]?\s*/gi,
  /\bgreat\s+(question|idea|suggestion)[!.]?\s*/gi,
  /\bi('d|would)\s+be\s+happy\s+to\s+/gi,
  /\bplease\s+note\s+that\s*/gi,
  /\bit('s|is)\s+important\s+to\s+note\s+that\s*/gi,
  /\bthank\s+you\s+for\s+(your\s+)?(patience|question|feedback)[.!]?\s*/gi,
];

// ---------------------------------------------------------------------------
// Raw output type classifier
// ---------------------------------------------------------------------------

/**
 * Classify the raw output into a translation strategy.
 *
 * @param {string} raw
 * @param {string} [sourceType] Explicit type hint from caller ('doctor', 'sync', 'agent', etc.)
 * @returns {string} Output type key
 */
function classifyOutput(raw, sourceType) {
  if (sourceType) return sourceType;
  if (!raw || typeof raw !== 'string') return 'empty';

  const lower = raw.toLowerCase();

  if (lower.includes('error') && (lower.includes('stack') || lower.includes('  at '))) {
    return 'stack-trace';
  }
  if (/✓|✗|●\s*(pass|fail)|tests?\s+(passed|failed)/i.test(raw)) {
    return 'test-results';
  }
  if (/\b(synced?|updated?\s+to|redeployed|provider)\b/i.test(raw)) {
    return 'sync-log';
  }
  if (/\b(healthy?|ok|warning|error|issue)\b.*\n.*\b(healthy?|ok|warning|error|issue)\b/i.test(raw)) {
    return 'doctor-output';
  }
  if (/^(error|warn(ing)?|info|debug):/im.test(raw)) {
    return 'log-output';
  }
  if (raw.trim().length === 0) {
    return 'empty';
  }

  return 'agent-result';
}

// ---------------------------------------------------------------------------
// ConciergeResponseTranslator
// ---------------------------------------------------------------------------

export class ConciergeResponseTranslator {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.redactPaths=true]     Strip absolute paths from output
   * @param {boolean} [options.stripFiller=true]     Remove filler phrases
   * @param {boolean} [options.suppressNoise=true]   Remove debug/trace lines
   * @param {number}  [options.summaryThreshold=500] Character count above which
   *   output is summarised with an expand offer (0 = never summarise)
   */
  constructor({
    redactPaths = true,
    stripFiller = true,
    suppressNoise = true,
    summaryThreshold = 500,
  } = {}) {
    this.redactPaths = redactPaths;
    this.stripFiller = stripFiller;
    this.suppressNoise = suppressNoise;
    this.summaryThreshold = summaryThreshold;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Translate raw output into a composed, concierge-voiced response.
   *
   * @param {string} raw         Raw output from the underlying skill/agent/flow
   * @param {Object} [options]
   * @param {boolean}  [options.raw]           Skip translation (return raw as-is)
   * @param {boolean}  [options.verbose]        Alias for raw
   * @param {string}   [options.sourceType]     Output type hint (see classifyOutput)
   * @param {boolean}  [options.discreet]       Force discreet mode
   * @param {boolean}  [options.isSensitive]    Mark as sensitive (enables discreet mode)
   * @param {string}   [options.context]        Brief context string for anonymous outputs
   * @returns {TranslationResult}
   */
  translate(raw, options = {}) {
    const { raw: rawMode, verbose, sourceType, discreet, isSensitive, context } = options;
    const bypass = rawMode || verbose;

    if (bypass) {
      return { translated: raw ?? '', bypassed: true, discreetApplied: false };
    }

    const outputType = classifyOutput(raw, sourceType);
    const applyDiscreet = discreet || isSensitive || SENSITIVE_OPERATION_CATEGORIES.has(outputType);

    let result = raw ?? '';

    // 1. Suppress sensitive content in discreet mode
    if (applyDiscreet) {
      result = this._applySensitiveRedaction(result);
    }

    // 2. Remove technical noise (stack frames, debug lines)
    if (this.suppressNoise) {
      result = this._suppressNoise(result);
    }

    // 3. Redact absolute file paths
    if (this.redactPaths && applyDiscreet) {
      result = result.replace(PATH_PATTERN, '[path]');
    }

    // 4. Strip filler phrases
    if (this.stripFiller) {
      result = this._stripFiller(result);
    }

    // 5. Apply type-specific translation
    result = this._translateByType(result, outputType, context);

    // 6. Normalise whitespace
    result = result.replace(/\n{3,}/g, '\n\n').trim();

    return {
      translated: result,
      bypassed: false,
      discreetApplied: applyDiscreet,
      outputType,
    };
  }

  /**
   * Check whether a string contains sensitive content.
   * Used by callers to decide whether to enable discreet mode.
   *
   * @param {string} text
   * @returns {boolean}
   */
  isSensitiveContent(text) {
    if (!text) return false;
    return SENSITIVE_PATTERNS.some((p) => p.test(text));
  }

  /**
   * Determine whether a given operation category triggers discreet mode.
   *
   * @param {string} category
   * @returns {boolean}
   */
  isSensitiveCategory(category) {
    return SENSITIVE_OPERATION_CATEGORIES.has(category);
  }

  // -------------------------------------------------------------------------
  // Type-specific translation strategies
  // -------------------------------------------------------------------------

  /**
   * Route to the appropriate translation strategy by output type.
   */
  _translateByType(text, outputType, context) {
    switch (outputType) {
      case 'doctor-output':     return this._translateDoctorOutput(text);
      case 'stack-trace':       return this._translateStackTrace(text, context);
      case 'sync-log':          return this._translateSyncLog(text);
      case 'test-results':      return this._translateTestResults(text);
      case 'log-output':        return this._translateLogOutput(text);
      case 'empty':             return this._translateEmpty(context);
      case 'token-rotation':
      case 'credential-update':
      case 'key-management':    return this._translateSensitiveOp(text, context);
      default:                  return this._translateAgentResult(text);
    }
  }

  /**
   * `aiwg doctor` output → concise health summary
   */
  _translateDoctorOutput(text) {
    const issues = [];
    const lines = text.split('\n');

    let healthyCount = 0;
    let issueCount = 0;

    for (const line of lines) {
      if (/\b(ok|healthy|pass|✓)\b/i.test(line)) {
        healthyCount++;
      } else if (/\b(error|fail|warn(ing)?|issue|missing|✗)\b/i.test(line)) {
        issueCount++;
        // Extract a short label from the line for the summary
        const label = line.replace(/^.*?(error|fail|warn(ing)?|issue|missing|✗)[:\s]*/i, '').trim();
        if (label && label.length < 120) {
          issues.push(label);
        }
      }
    }

    if (issueCount === 0) {
      return 'All systems healthy.';
    }

    const summary = `${issueCount} issue${issueCount === 1 ? '' : 's'} found.`;
    const detail = issues.slice(0, 3).join('; ');
    return issues.length > 0
      ? `${summary} ${detail}${issues.length > 3 ? ` (and ${issues.length - 3} more)` : '.'}`
      : summary;
  }

  /**
   * Stack trace / error → actionable summary
   */
  _translateStackTrace(text, context) {
    // Extract the top-level error message (first non-blank line)
    const lines = text.split('\n').filter((l) => l.trim());
    const topError = lines.find((l) => /\b(error|exception|failed|cannot|unable)\b/i.test(l));
    const errorLabel = topError
      ? topError.replace(/^(Error|TypeError|RangeError|SyntaxError):\s*/i, '').trim()
      : 'an unexpected error';

    const what = context ? `${context}` : 'the operation';
    return `I encountered a problem with ${what} — ${errorLabel}. The details have been logged.`;
  }

  /**
   * Verbose sync log → compact confirmation
   */
  _translateSyncLog(text) {
    // Look for version number
    const versionMatch = text.match(/v?(\d{4}\.\d+\.\d+)/);
    const version = versionMatch ? `v${versionMatch[1]}` : null;

    // Count redeployed providers
    const redeployMatches = text.match(/redeploy(ed|ing)/gi);
    const redeployCount = redeployMatches ? redeployMatches.length : null;

    if (version && redeployCount) {
      return `Updated to ${version}. ${redeployCount} provider${redeployCount === 1 ? '' : 's'} redeployed.`;
    }
    if (version) {
      return `Updated to ${version}.`;
    }

    return 'Sync complete.';
  }

  /**
   * Test results → concise pass/fail summary
   */
  _translateTestResults(text) {
    const passMatch = text.match(/(\d+)\s+(tests?\s+)?(passed|✓)/i);
    const failMatch = text.match(/(\d+)\s+(tests?\s+)?(failed|✗|●)/i);

    const passed = passMatch ? parseInt(passMatch[1], 10) : null;
    const failed = failMatch ? parseInt(failMatch[1], 10) : null;

    if (failed !== null && failed > 0) {
      const detail = passed !== null ? ` (${passed} passed)` : '';
      return `${failed} test${failed === 1 ? '' : 's'} failed${detail}. Review the output for details.`;
    }

    if (passed !== null) {
      return `All ${passed} test${passed === 1 ? '' : 's'} passed.`;
    }

    // Fallback: preserve the result but strip noise
    return text.trim();
  }

  /**
   * Structured log output → surface warnings/errors only
   */
  _translateLogOutput(text) {
    const lines = text.split('\n');
    const important = lines.filter((l) => /^(error|warn(ing)?|fatal):/i.test(l.trim()));

    if (important.length === 0) {
      return 'Completed successfully.';
    }

    return important.slice(0, 5).join('\n');
  }

  /**
   * Empty output → in-persona acknowledgment
   */
  _translateEmpty(context) {
    return context ? `${context} — no output returned.` : 'Completed — no output to report.';
  }

  /**
   * Sensitive operation output → minimal confirmation
   */
  _translateSensitiveOp(_text, context) {
    const what = context || 'The operation';
    return `${what} completed. Ask for details if needed.`;
  }

  /**
   * Generic agent/skill result → structured summary
   */
  _translateAgentResult(text) {
    if (!text || !text.trim()) return this._translateEmpty();

    // If already compact, return as-is
    if (text.trim().length <= this.summaryThreshold) {
      return text.trim();
    }

    // Long output: extract the first meaningful paragraph as a summary
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
    if (paragraphs.length > 1) {
      const summary = paragraphs[0].trim();
      return summary + '\n\n*(Full details available — ask to expand.)*';
    }

    return text.trim();
  }

  // -------------------------------------------------------------------------
  // Noise / filler / redaction helpers
  // -------------------------------------------------------------------------

  /**
   * Redact lines containing sensitive credential patterns.
   */
  _applySensitiveRedaction(text) {
    return text
      .split('\n')
      .map((line) => {
        for (const pattern of SENSITIVE_PATTERNS) {
          if (pattern.test(line)) {
            return '[sensitive content redacted]';
          }
        }
        return line;
      })
      .join('\n');
  }

  /**
   * Remove debug/trace noise lines while preserving the rest.
   */
  _suppressNoise(text) {
    return text
      .split('\n')
      .filter((line) => !NOISE_PATTERNS.some((p) => p.test(line)))
      .join('\n');
  }

  /**
   * Strip filler phrases that violate the "pertinent" tone rule.
   */
  _stripFiller(text) {
    let result = text;
    for (const pattern of FILLER_PHRASES) {
      result = result.replace(pattern, '');
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  SENSITIVE_OPERATION_CATEGORIES,
  SENSITIVE_PATTERNS,
  NOISE_PATTERNS,
  FILLER_PHRASES,
  classifyOutput,
};

/**
 * @typedef {Object} TranslationResult
 * @property {string}  translated       The translated (or raw-bypassed) response
 * @property {boolean} bypassed         True when raw/verbose bypass was applied
 * @property {boolean} discreetApplied  True when discreet mode was applied
 * @property {string}  [outputType]     Classified output type (absent when bypassed)
 */
