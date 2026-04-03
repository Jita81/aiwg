/**
 * AIWG Sidebar Tree Views
 *
 * Provides three tree view data providers for the AIWG sidebar:
 *  - StatusTreeProvider   → Project Status (config present, CLI installed, stale check)
 *  - FrameworksProvider   → Installed Frameworks (from aiwg.config.json)
 *  - ScriptsProvider      → Scripts (click to run via Tasks API)
 */

import * as vscode from 'vscode';
import { AiwgCliRunner } from '../cli/runner';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface AiwgConfig {
  installed?: Record<string, InstalledFramework>;
  scripts?: Record<string, string>;
  providers?: string[];
}

interface InstalledFramework {
  version?: string;
  providers?: string[];
  installedAt?: string;
}

// ---------------------------------------------------------------------------
// Tree item helpers
// ---------------------------------------------------------------------------

class AiwgTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options?: {
      description?: string;
      icon?: vscode.ThemeIcon;
      command?: vscode.Command;
      contextValue?: string;
    }
  ) {
    super(label, collapsibleState);
    if (options?.description) this.description = options.description;
    if (options?.icon) this.iconPath = options.icon;
    if (options?.command) this.command = options.command;
    if (options?.contextValue) this.contextValue = options.contextValue;
  }
}

// ---------------------------------------------------------------------------
// Status tree provider
// ---------------------------------------------------------------------------

export class StatusTreeProvider implements vscode.TreeDataProvider<AiwgTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AiwgTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private runner: AiwgCliRunner,
    private workspaceRoot: string
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AiwgTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<AiwgTreeItem[]> {
    const items: AiwgTreeItem[] = [];

    // CLI status
    const cliOk = !!this.runner.cliPath;
    items.push(
      new AiwgTreeItem(
        'CLI',
        vscode.TreeItemCollapsibleState.None,
        {
          description: cliOk ? this.runner.cliPath : 'not found',
          icon: new vscode.ThemeIcon(cliOk ? 'check' : 'warning'),
          command: cliOk ? undefined : {
            command: 'aiwg.installCli',
            title: 'Install CLI'
          }
        }
      )
    );

    // Config status
    const config = await this.readConfig();
    const configOk = config !== null;
    items.push(
      new AiwgTreeItem(
        'Config',
        vscode.TreeItemCollapsibleState.None,
        {
          description: configOk ? '.aiwg/aiwg.config.json' : 'not initialized',
          icon: new vscode.ThemeIcon(configOk ? 'check' : 'circle-outline'),
          command: configOk ? undefined : {
            command: 'aiwg.init',
            title: 'Initialize AIWG'
          }
        }
      )
    );

    // MCP status
    const mcpConfigured = await this.isMcpConfigured();
    items.push(
      new AiwgTreeItem(
        'MCP Server',
        vscode.TreeItemCollapsibleState.None,
        {
          description: mcpConfigured ? '.vscode/mcp.json' : 'not configured',
          icon: new vscode.ThemeIcon(mcpConfigured ? 'check' : 'circle-outline'),
          command: mcpConfigured ? undefined : {
            command: 'aiwg.configureMcp',
            title: 'Configure MCP'
          }
        }
      )
    );

    return items;
  }

  private async readConfig(): Promise<AiwgConfig | null> {
    if (!this.workspaceRoot) return null;
    const uri = vscode.Uri.file(`${this.workspaceRoot}/.aiwg/aiwg.config.json`);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(bytes).toString('utf-8')) as AiwgConfig;
    } catch {
      return null;
    }
  }

  private async isMcpConfigured(): Promise<boolean> {
    if (!this.workspaceRoot) return false;
    const uri = vscode.Uri.file(`${this.workspaceRoot}/.vscode/mcp.json`);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const config = JSON.parse(Buffer.from(bytes).toString('utf-8')) as { servers?: Record<string, unknown> };
      return !!config.servers?.aiwg;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Frameworks tree provider
// ---------------------------------------------------------------------------

export class FrameworksTreeProvider implements vscode.TreeDataProvider<AiwgTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AiwgTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private workspaceRoot: string) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AiwgTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<AiwgTreeItem[]> {
    const config = await this.readConfig();
    if (!config?.installed) {
      return [
        new AiwgTreeItem(
          'No frameworks installed',
          vscode.TreeItemCollapsibleState.None,
          {
            icon: new vscode.ThemeIcon('info'),
            command: { command: 'aiwg.deploy', title: 'Deploy Framework' }
          }
        )
      ];
    }

    return Object.entries(config.installed).map(([name, fw]) => {
      const providers = fw.providers?.join(', ') ?? '';
      return new AiwgTreeItem(name, vscode.TreeItemCollapsibleState.None, {
        description: [fw.version, providers].filter(Boolean).join(' · '),
        icon: new vscode.ThemeIcon('package'),
        contextValue: 'framework'
      });
    });
  }

  private async readConfig(): Promise<AiwgConfig | null> {
    if (!this.workspaceRoot) return null;
    const uri = vscode.Uri.file(`${this.workspaceRoot}/.aiwg/aiwg.config.json`);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(bytes).toString('utf-8')) as AiwgConfig;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Scripts tree provider
// ---------------------------------------------------------------------------

export class ScriptsTreeProvider implements vscode.TreeDataProvider<AiwgTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AiwgTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private scripts: Record<string, string> = {};

  constructor(private workspaceRoot: string) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AiwgTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<AiwgTreeItem[]> {
    const config = await this.readConfig();
    this.scripts = config?.scripts ?? {};

    if (!Object.keys(this.scripts).length) {
      return [
        new AiwgTreeItem(
          'No scripts defined',
          vscode.TreeItemCollapsibleState.None,
          { icon: new vscode.ThemeIcon('info') }
        )
      ];
    }

    return Object.entries(this.scripts).map(([name, cmd]) =>
      new AiwgTreeItem(name, vscode.TreeItemCollapsibleState.None, {
        description: cmd,
        icon: new vscode.ThemeIcon('run'),
        command: {
          command: 'aiwg.runScript',
          title: `Run ${name}`,
          arguments: [name]
        },
        contextValue: 'script'
      })
    );
  }

  getScriptNames(): string[] {
    return Object.keys(this.scripts);
  }

  private async readConfig(): Promise<AiwgConfig | null> {
    if (!this.workspaceRoot) return null;
    const uri = vscode.Uri.file(`${this.workspaceRoot}/.aiwg/aiwg.config.json`);
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(bytes).toString('utf-8')) as AiwgConfig;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Combined facade used by extension.ts
// ---------------------------------------------------------------------------

export class AiwgSidebarProvider {
  readonly statusProvider: StatusTreeProvider;
  readonly frameworksProvider: FrameworksTreeProvider;
  readonly scriptsProvider: ScriptsTreeProvider;

  constructor(
    _context: vscode.ExtensionContext,
    runner: AiwgCliRunner,
    workspaceRoot: string
  ) {
    this.statusProvider = new StatusTreeProvider(runner, workspaceRoot);
    this.frameworksProvider = new FrameworksTreeProvider(workspaceRoot);
    this.scriptsProvider = new ScriptsTreeProvider(workspaceRoot);
  }

  refresh(): void {
    this.statusProvider.refresh();
    this.frameworksProvider.refresh();
    this.scriptsProvider.refresh();
  }

  getScriptNames(): string[] {
    return this.scriptsProvider.getScriptNames();
  }
}
