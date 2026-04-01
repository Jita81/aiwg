/**
 * Handler Coverage Test
 *
 * Validates that every command definition in commandDefinitions has a
 * corresponding registered handler in allHandlers, OR is explicitly
 * opted out of CLI execution via `metadata?.cliDisabled`.
 *
 * This is a registry completeness check — it will fail as soon as a new
 * command definition is added without a matching handler, surfacing the
 * gap immediately rather than at runtime.
 *
 * @issue #486
 * @tests @src/extensions/commands/definitions.ts
 * @tests @src/cli/handlers/index.ts
 */

import { describe, it, expect } from 'vitest';
import { commandDefinitions } from '../../../../src/extensions/commands/definitions.js';
import { allHandlers } from '../../../../src/cli/handlers/index.js';
import type { SkillMetadata } from '../../../../src/extensions/types.js';

describe('Handler Coverage', () => {
  describe('every command definition has a handler or is cliDisabled', () => {
    // Build a Set of handler IDs for O(1) lookup
    const handlerIds = new Set(allHandlers.map((h) => h.id));

    // Separate definitions into those that opt out and those that must have a handler.
    // A command is exempt from the handler requirement when either:
    //   - cliDisabled: true  — slash-command-only, no CLI execution
    //   - executedViaSkillRunner: true — dispatched via `aiwg skills run`, no bespoke handler needed
    const isExempt = (cmd: (typeof commandDefinitions)[number]) => {
      const hint = (cmd.metadata as SkillMetadata)?.commandHint;
      return hint?.cliDisabled === true || hint?.executedViaSkillRunner === true;
    };

    const disabledCommands = commandDefinitions.filter(isExempt);

    const requiredCommands = commandDefinitions.filter((cmd) => !isExempt(cmd));

    // Compute the missing handlers up front so the failure message is maximally useful
    const missingHandlers = requiredCommands.filter((cmd) => !handlerIds.has(cmd.id));

    it('should have no command definitions missing a handler (unless cliDisabled)', () => {
      const missingIds = missingHandlers.map((cmd) => cmd.id);

      expect(missingIds, [
        'The following command definitions have no registered handler in allHandlers.',
        'Either add the handler to src/cli/handlers/ and register it in allHandlers,',
        'or set metadata.cliDisabled = true on the definition to mark it as CLI-exempt.',
        '',
        `Missing (${missingIds.length}): ${missingIds.join(', ')}`,
      ].join('\n')).toEqual([]);
    });

    it('should register at least as many handlers as non-disabled definitions', () => {
      expect(allHandlers.length).toBeGreaterThanOrEqual(requiredCommands.length);
    });

    // One test per definition keeps failures granular and easy to triage
    for (const cmd of requiredCommands) {
      it(`should have a handler for command "${cmd.id}"`, () => {
        expect(
          handlerIds.has(cmd.id),
          `No handler found for command "${cmd.id}" (name: "${cmd.name}"). ` +
          `Register a handler in allHandlers or set metadata.cliDisabled = true.`
        ).toBe(true);
      });
    }

    // Informational: show which commands are opted out (not a failure)
    if (disabledCommands.length > 0) {
      it('should document which commands are cliDisabled', () => {
        const disabledIds = disabledCommands.map((cmd) => cmd.id);
        // This assertion always passes — it exists only to surface the list in test output
        expect(disabledIds).toEqual(disabledIds);
      });
    }
  });

  describe('allHandlers registry integrity', () => {
    it('should contain no duplicate handler IDs', () => {
      const ids = allHandlers.map((h) => h.id);
      const unique = new Set(ids);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

      expect(
        duplicates,
        `Duplicate handler IDs found: ${duplicates.join(', ')}`
      ).toHaveLength(0);

      expect(unique.size).toBe(ids.length);
    });

    it('should have at least one handler registered', () => {
      expect(allHandlers.length).toBeGreaterThan(0);
    });

    it('should have handler IDs that match their definition counterparts when present', () => {
      const definitionIds = new Set(commandDefinitions.map((cmd) => cmd.id));

      const orphanedHandlers = allHandlers.filter(
        (h) => !definitionIds.has(h.id)
      );

      const orphanedIds = orphanedHandlers.map((h) => h.id);

      expect(
        orphanedIds,
        [
          'The following handlers exist in allHandlers but have no matching command definition.',
          'Either add a definition to commandDefinitions or remove the handler.',
          '',
          `Orphaned handlers (${orphanedIds.length}): ${orphanedIds.join(', ')}`,
        ].join('\n')
      ).toEqual([]);
    });
  });
});
