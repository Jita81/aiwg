/**
 * AIWG Extension Test Suite
 *
 * Basic smoke tests for activation, commands, and MCP auto-config.
 * Run via: npm test (inside vscode-extension/)
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { configureMcp } from '../../src/mcp/auto-config';
import { AiwgCliRunner } from '../../src/cli/runner';

suite('AIWG Extension', () => {
  test('Extension activates without error', async () => {
    const ext = vscode.extensions.getExtension('jmagly.aiwg');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    // If ext is undefined we're running unit-style; just assert nothing threw
    assert.ok(true);
  });

  test('Commands are registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const aiwgCommands = commands.filter((c) => c.startsWith('aiwg.'));
    // Phase 1 registers at least 7 commands
    assert.ok(aiwgCommands.length >= 7, `Expected ≥7 aiwg commands, got ${aiwgCommands.length}`);
  });
});

suite('AiwgCliRunner', () => {
  test('Returns error result when CLI not found', async () => {
    const runner = new AiwgCliRunner('', '/tmp');
    const result = await runner.run(['version']);
    assert.strictEqual(result.exitCode, 1);
    assert.ok(result.stderr.includes('not found'));
  });
});

suite('MCP Auto-Config', () => {
  let tmpDir: string;

  setup(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aiwg-test-'));
  });

  teardown(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('Creates .vscode/mcp.json when absent', async () => {
    await configureMcp(tmpDir, '/usr/local/bin/aiwg');
    const mcpPath = path.join(tmpDir, '.vscode', 'mcp.json');
    const content = JSON.parse(await fs.readFile(mcpPath, 'utf-8'));
    assert.strictEqual(content.servers.aiwg.command, '/usr/local/bin/aiwg');
    assert.deepStrictEqual(content.servers.aiwg.args, ['mcp', 'serve']);
  });

  test('Is idempotent — does not overwrite existing aiwg entry', async () => {
    const vscodDir = path.join(tmpDir, '.vscode');
    await fs.mkdir(vscodDir, { recursive: true });
    const mcpPath = path.join(vscodDir, 'mcp.json');
    const initial = { servers: { aiwg: { type: 'stdio', command: '/old/path', args: ['mcp', 'serve'] } } };
    await fs.writeFile(mcpPath, JSON.stringify(initial));

    await configureMcp(tmpDir, '/new/path/aiwg');

    const content = JSON.parse(await fs.readFile(mcpPath, 'utf-8'));
    assert.strictEqual(content.servers.aiwg.command, '/old/path', 'Should not overwrite existing entry');
  });

  test('Preserves existing MCP servers', async () => {
    const vscodDir = path.join(tmpDir, '.vscode');
    await fs.mkdir(vscodDir, { recursive: true });
    const mcpPath = path.join(vscodDir, 'mcp.json');
    const existing = { servers: { other: { type: 'stdio', command: '/other/tool', args: [] } } };
    await fs.writeFile(mcpPath, JSON.stringify(existing));

    await configureMcp(tmpDir, '/usr/local/bin/aiwg');

    const content = JSON.parse(await fs.readFile(mcpPath, 'utf-8'));
    assert.ok(content.servers.other, 'Should preserve other server');
    assert.ok(content.servers.aiwg, 'Should add aiwg server');
  });
});
