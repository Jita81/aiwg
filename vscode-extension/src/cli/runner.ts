/**
 * AIWG CLI Runner
 *
 * Wraps the aiwg CLI as a subprocess.
 * Provides both silent (Promise-based) and terminal (Tasks API) execution.
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class AiwgCliRunner {
  constructor(
    public readonly cliPath: string,
    public readonly cwd: string
  ) {}

  /** Detect the aiwg CLI path. Respects user setting, falls back to PATH. */
  static async detect(context: vscode.ExtensionContext): Promise<string> {
    const config = vscode.workspace.getConfiguration('aiwg');
    const configured = config.get<string>('cli.path');
    if (configured && configured.trim()) {
      return configured.trim();
    }

    // Try to find aiwg in PATH
    try {
      const { stdout } = await execAsync('which aiwg 2>/dev/null || where aiwg 2>nul');
      const found = stdout.trim();
      if (found) return found;
    } catch {
      // not found
    }

    return '';
  }

  /** Run aiwg CLI silently; returns stdout/stderr/exitCode. */
  async run(args: string[]): Promise<CliResult> {
    if (!this.cliPath) {
      return { exitCode: 1, stdout: '', stderr: 'aiwg CLI not found' };
    }

    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, args, {
        cwd: this.cwd || process.cwd(),
        env: process.env
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => resolve({ exitCode: code ?? 0, stdout, stderr }));
      proc.on('error', (err) => resolve({ exitCode: 1, stdout: '', stderr: err.message }));
    });
  }

  /** Run aiwg CLI as a VS Code Task (visible in terminal panel with live output). */
  async runAsTask(args: string[], name: string): Promise<void> {
    const cliCmd = this.cliPath || 'aiwg';
    const task = new vscode.Task(
      { type: 'aiwg', args },
      vscode.TaskScope.Workspace,
      name,
      'aiwg',
      new vscode.ShellExecution(`${cliCmd} ${args.join(' ')}`, {
        cwd: this.cwd || undefined
      })
    );
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Shared,
      showReuseMessage: false
    };
    await vscode.tasks.executeTask(task);
  }
}
