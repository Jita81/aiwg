/**
 * AIWG Status Bar Item
 *
 * Shows current project AIWG state in the VS Code bottom bar.
 * Format: $(aiwg-icon) AIWG: sdlc + rlm  [claude, cursor]
 * Click → opens AIWG sidebar.
 */

import * as vscode from 'vscode';
import { AiwgCliRunner } from '../cli/runner';

interface AiwgConfig {
  installed?: Record<string, { version?: string; providers?: string[] }>;
}

export class AiwgStatusBar {
  private item: vscode.StatusBarItem;

  constructor(
    private context: vscode.ExtensionContext,
    private runner: AiwgCliRunner
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = 'aiwg.status';
    this.item.tooltip = 'AIWG — click to open project status';
    context.subscriptions.push(this.item);
  }

  async refresh(): Promise<void> {
    const config = await this.readConfig();

    if (!config) {
      // No AIWG config in this workspace
      this.item.text = '$(circle-outline) AIWG';
      this.item.tooltip = 'AIWG not initialized — click to set up';
      this.item.command = 'aiwg.init';
      this.item.show();
      return;
    }

    const installed = config.installed ?? {};
    const frameworks = Object.keys(installed);

    if (!frameworks.length) {
      this.item.text = '$(warning) AIWG: no frameworks';
      this.item.command = 'aiwg.deploy';
    } else {
      const names = frameworks.join(' + ');
      const providers = this.collectProviders(installed);
      const providerStr = providers.length ? `  [${providers.join(', ')}]` : '';
      this.item.text = `$(check) AIWG: ${names}${providerStr}`;
      this.item.command = 'aiwg.status';
    }

    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  private async readConfig(): Promise<AiwgConfig | null> {
    const workspaceRoot = this.runner.cwd;
    if (!workspaceRoot) return null;

    const configUri = vscode.Uri.file(`${workspaceRoot}/.aiwg/aiwg.config.json`);
    try {
      const bytes = await vscode.workspace.fs.readFile(configUri);
      return JSON.parse(Buffer.from(bytes).toString('utf-8')) as AiwgConfig;
    } catch {
      return null;
    }
  }

  private collectProviders(
    installed: Record<string, { providers?: string[] }>
  ): string[] {
    const seen = new Set<string>();
    for (const fw of Object.values(installed)) {
      for (const p of fw.providers ?? []) {
        seen.add(p);
      }
    }
    return [...seen];
  }
}
