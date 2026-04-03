/**
 * MCP Auto-Configuration
 *
 * Writes .vscode/mcp.json on activation to register the AIWG MCP server
 * with VS Code's built-in MCP client (VS Code 1.99+).
 *
 * Idempotent: skips if aiwg entry already present.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

interface McpConfig {
  servers?: Record<string, McpServer>;
  [key: string]: unknown;
}

interface McpServer {
  type: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export async function configureMcp(workspaceRoot: string, cliPath: string): Promise<void> {
  const vscodDir = path.join(workspaceRoot, '.vscode');
  const mcpConfigPath = path.join(vscodDir, 'mcp.json');

  // Read existing config if present
  let existing: McpConfig = {};
  try {
    const content = await fs.readFile(mcpConfigPath, 'utf-8');
    existing = JSON.parse(content) as McpConfig;
  } catch {
    // File does not exist yet — start fresh
  }

  // Idempotent: skip if already configured
  if (existing.servers?.aiwg) return;

  const updated: McpConfig = {
    ...existing,
    servers: {
      ...((existing.servers as object) ?? {}),
      aiwg: {
        type: 'stdio',
        command: cliPath,
        args: ['mcp', 'serve']
      }
    }
  };

  await fs.mkdir(vscodDir, { recursive: true });
  await fs.writeFile(mcpConfigPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}
