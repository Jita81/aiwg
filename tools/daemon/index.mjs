#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createClient } from './ipc-client.mjs';
import { TmuxManager, formatStatusDashboard } from './tmux-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PID_FILE = '.aiwg/daemon.pid';
const LOG_FILE = '.aiwg/daemon/daemon.log';
const STATE_FILE = '.aiwg/daemon/state.json';
const SOCKET_PATH = '.aiwg/daemon/daemon.sock';

class DaemonCLI {
  constructor() {
    this.command = process.argv[2];
    this.flags = this.parseFlags(process.argv.slice(3));
  }

  parseFlags(args) {
    const flags = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].slice(2);
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
        flags[key] = value;
        if (value !== true) i++;
      }
    }
    return flags;
  }

  async run() {
    switch (this.command) {
      case 'start':
        await this.start();
        break;
      case 'stop':
        await this.stop();
        break;
      case 'status':
        await this.status();
        break;
      case 'logs':
        await this.logs();
        break;
      case 'restart':
        await this.restart();
        break;
      case 'attach':
        await this.attach();
        break;
      case 'chat':
        await this.chat();
        break;
      case 'task':
        await this.task();
        break;
      case 'init':
        await this.init();
        break;
      case 'rooms':
        await this.rooms();
        break;
      case 'autonomous':
        await this.autonomous();
        break;
      case 'schedule':
        await this.schedule();
        break;
      case 'memory':
        await this.memory();
        break;
      default:
        this.usage();
        process.exit(1);
    }
  }

  async start() {
    if (this.flags.docker) {
      await this.startDocker();
      return;
    }

    if (this.isDaemonRunning()) {
      const pid = this.readPidFile();
      console.error(`Daemon is already running (PID: ${pid})`);
      process.exit(1);
    }

    this.ensureDirectories();

    if (this.flags.foreground) {
      await this.startForeground();
    } else {
      await this.startDetached();
    }
  }

  async startDocker() {
    try {
      const { ContainerManager } = await import('../docker/container-manager.mjs');
      const manager = new ContainerManager({
        projectDir: process.cwd(),
        webPort: parseInt(this.flags.port || '7474', 10),
      });

      if (!manager.isDockerAvailable()) {
        console.error('Docker is not available. Install Docker or run without --docker.');
        process.exit(1);
      }

      const { containerId, containerName } = manager.start();
      console.log(`Daemon started in Docker container: ${containerName} (${containerId})`);
      console.log(`Web UI: http://localhost:${this.flags.port || 7474}`);
    } catch (error) {
      console.error(`Failed to start Docker container: ${error.message}`);
      process.exit(1);
    }
  }

  async startForeground() {
    console.log('Starting daemon in foreground mode...');
    const daemonScript = path.join(__dirname, 'daemon-main.mjs');

    const child = spawn(process.execPath, [daemonScript], {
      stdio: 'inherit',
      env: process.env
    });

    child.on('exit', (code) => {
      console.log(`Daemon exited with code ${code}`);
      process.exit(code);
    });
  }

  async startDetached() {
    console.log('Starting daemon...');
    const daemonScript = path.join(__dirname, 'daemon-main.mjs');

    const logFd = fs.openSync(LOG_FILE, 'a');

    const child = spawn(process.execPath, [daemonScript], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env
    });

    child.unref();

    await new Promise(resolve => setTimeout(resolve, 1000));

    if (this.isDaemonRunning()) {
      const pid = this.readPidFile();
      console.log(`Daemon started successfully (PID: ${pid})`);
      console.log(`Logs: ${LOG_FILE}`);
    } else {
      console.error('Daemon failed to start. Check logs for details.');
      process.exit(1);
    }
  }

  async stop() {
    if (!this.isDaemonRunning()) {
      console.log('Daemon is not running');
      return;
    }

    const pid = this.readPidFile();
    console.log(`Stopping daemon (PID: ${pid})...`);

    try {
      process.kill(pid, 'SIGTERM');

      const maxWait = 10000;
      const checkInterval = 500;
      let waited = 0;

      while (waited < maxWait) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;

        if (!this.isPidAlive(pid)) {
          console.log('Daemon stopped gracefully');
          this.cleanup();
          return;
        }
      }

      console.log('Daemon did not stop gracefully, sending SIGKILL...');
      process.kill(pid, 'SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!this.isPidAlive(pid)) {
        console.log('Daemon killed');
        this.cleanup();
      } else {
        console.error('Failed to stop daemon');
        process.exit(1);
      }
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.log('Daemon process not found (stale PID file)');
        this.cleanup();
      } else {
        console.error(`Failed to stop daemon: ${error.message}`);
        process.exit(1);
      }
    }
  }

  async status() {
    if (!this.isDaemonRunning()) {
      console.log('Daemon: stopped');
      return;
    }

    const pid = this.readPidFile();
    console.log(`Daemon: running (PID: ${pid})`);

    // Try live IPC query first, fall back to state file
    try {
      const client = await createClient(SOCKET_PATH);
      const state = await client.request('daemon.status');
      client.disconnect();

      console.log(`Started: ${state.started_at}`);
      console.log(`Uptime: ${state.uptime_seconds}s`);
      console.log(`Health: ${state.health}`);

      const sub = state.subsystems;
      console.log(`\nIPC clients: ${sub.ipc?.clients || 0}`);

      if (sub.supervisor) {
        console.log(`\nAgents:`);
        console.log(`  Running: ${sub.supervisor.running}`);
        console.log(`  Queued: ${sub.supervisor.queued}`);
        console.log(`  Max concurrent: ${sub.supervisor.maxConcurrency}`);
      }

      if (sub.automation?.enabled) {
        console.log(`\nAutomation: enabled (${sub.automation.ruleCount} rules)`);
      }

      if (sub.file_watcher?.enabled) {
        console.log(`\nFile watcher: enabled (${sub.file_watcher.events_received} events)`);
      }
      if (sub.scheduler?.enabled) {
        console.log(`Scheduler: enabled (${sub.scheduler.jobs} jobs)`);
      }
      if (sub.messaging?.enabled) {
        console.log(`Messaging: enabled (${sub.messaging.adapters} adapters)`);
      }
      return;
    } catch {
      // IPC unavailable, fall back to state file
    }

    if (fs.existsSync(STATE_FILE)) {
      try {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        console.log(`Started: ${state.started_at}`);
        console.log(`Uptime: ${state.uptime_seconds}s`);
        console.log(`Last heartbeat: ${state.last_heartbeat}`);
        console.log(`Health: ${state.health.status}`);

        if (state.agents) {
          console.log(`\nAgents:`);
          console.log(`  Running: ${state.agents.running}`);
          console.log(`  Queued: ${state.agents.queued}`);
        }

        console.log('\nMonitors:');
        if (state.monitors.file_watcher?.enabled) {
          console.log(`  File watcher: enabled (${state.monitors.file_watcher.events_received} events)`);
        }
        if (state.monitors.scheduler?.enabled) {
          console.log(`  Scheduler: enabled (${state.monitors.scheduler.jobs} jobs)`);
        }

        if (state.health.issues.length > 0) {
          console.log('\nIssues:');
          for (const issue of state.health.issues) {
            console.log(`  - ${issue}`);
          }
        }
      } catch (error) {
        console.error(`Failed to read state file: ${error.message}`);
      }
    }
  }

  async logs() {
    if (!fs.existsSync(LOG_FILE)) {
      console.log('No log file found');
      return;
    }

    const lines = parseInt(this.flags.lines || '50', 10);
    const follow = this.flags.follow || this.flags.f;

    if (follow) {
      const tail = spawn('tail', ['-f', '-n', String(lines), LOG_FILE], {
        stdio: 'inherit'
      });

      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });
    } else {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const allLines = content.split('\n');
      const tailLines = allLines.slice(-lines);
      console.log(tailLines.join('\n'));
    }
  }

  async restart() {
    console.log('Restarting daemon...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.start();
  }

  async attach() {
    const tmux = new TmuxManager({ sessionName: 'aiwg-daemon' });

    if (!tmux.isTmuxAvailable()) {
      console.error('tmux is not installed. Install with: apt install tmux');
      process.exit(1);
    }

    // If daemon is not running, start it first
    if (!this.isDaemonRunning()) {
      console.log('Daemon is not running. Starting...');
      await this.startDetached();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!tmux.sessionExists()) {
      // Create session with REPL in top pane, status in bottom pane
      const replScript = path.join(__dirname, 'repl-entry.mjs');
      const chatCommand = `${process.execPath} ${replScript}`;
      const statusCommand = `watch -n 5 "cat ${STATE_FILE} 2>/dev/null | node -e \\"process.stdin.on('data',d=>{try{const s=JSON.parse(d);console.log('Agents:',s.agents?.running||0,'running,',s.agents?.queued||0,'queued');console.log('Uptime:',s.uptime_seconds+'s')}catch{}})\\" 2>/dev/null || echo 'Waiting for daemon...'"`;

      try {
        tmux.createSession({
          chatCommand,
          statusCommand,
        });
        console.log('Created tmux session: aiwg-daemon');
      } catch (error) {
        console.error(`Failed to create session: ${error.message}`);
        process.exit(1);
      }
    }

    try {
      await tmux.attach(this.flags.readonly === true);
    } catch (error) {
      console.error(`Failed to attach: ${error.message}`);
      process.exit(1);
    }
  }

  async chat() {
    if (!this.isDaemonRunning()) {
      console.error('Daemon is not running. Start with: aiwg daemon start');
      process.exit(1);
    }

    const message = process.argv.slice(3).join(' ');
    if (!message) {
      console.error('Usage: aiwg daemon chat <message>');
      process.exit(1);
    }

    try {
      const client = await createClient(SOCKET_PATH);
      const result = await client.request('chat.send', { message });
      client.disconnect();
      console.log(`Task submitted: ${result.taskId}`);
    } catch (error) {
      console.error(`Failed to send message: ${error.message}`);
      process.exit(1);
    }
  }

  async init() {
    try {
      const { initProfile, listProfiles } = await import('./init-profile.mjs');
      const profileName = process.argv[3] || 'manager';

      if (profileName === 'list') {
        const profiles = listProfiles();
        console.log('Available profiles:');
        for (const p of profiles) {
          console.log(`  ${p}`);
        }
        return;
      }

      const result = initProfile({
        profile: profileName,
        force: this.flags.force === true,
      });

      console.log(`Daemon config initialized from "${result.profile}" profile`);
      console.log(`  Config: ${result.configPath}`);
      if (result.envPath) {
        console.log(`  Env template: ${result.envPath}`);
      }
      console.log('\nNext steps:');
      console.log('  1. Edit .aiwg/daemon.yaml to configure messaging tokens and rooms');
      console.log('  2. Copy .env.example to .env and fill in your values');
      console.log('  3. Run: aiwg daemon start');
    } catch (error) {
      console.error(`Init failed: ${error.message}`);
      process.exit(1);
    }
  }

  async rooms() {
    if (!this.isDaemonRunning()) {
      console.error('Daemon is not running');
      process.exit(1);
    }

    try {
      const client = await createClient(SOCKET_PATH);
      const status = await client.request('rooms.list');
      client.disconnect();

      if (!status || status.totalRooms === 0) {
        console.log('No rooms configured');
        return;
      }

      console.log(`Rooms: ${status.totalRooms} total, ${status.totalBindings} task binding(s)\n`);

      for (const [platform, rooms] of Object.entries(status.platforms || {})) {
        console.log(`${platform}:`);
        for (const room of rooms) {
          const defaultTag = room.isDefault ? ' [default]' : '';
          const tasks = room.boundTasks.length > 0 ? ` (tasks: ${room.boundTasks.join(', ')})` : '';
          console.log(`  ${room.label} (${room.id}) — ${room.purpose}${defaultTag}${tasks}`);
        }
      }
    } catch (error) {
      console.error(`Failed to list rooms: ${error.message}`);
      process.exit(1);
    }
  }

  async autonomous() {
    const subcommand = process.argv[3];

    if (!this.isDaemonRunning()) {
      console.error('Daemon is not running');
      process.exit(1);
    }

    try {
      const client = await createClient(SOCKET_PATH);

      switch (subcommand) {
        case 'enable': {
          const result = await client.request('autonomous.enable');
          console.log(`Autonomous mode: ${result.enabled ? 'enabled' : 'disabled'}`);
          break;
        }
        case 'disable': {
          const result = await client.request('autonomous.disable');
          console.log(`Autonomous mode: ${result.enabled ? 'enabled' : 'disabled'}`);
          break;
        }
        case 'status':
        default: {
          const status = await client.request('autonomous.status');
          console.log(`Autonomous mode: ${status.enabled ? 'enabled' : 'disabled'}`);
          if (status.enabled) {
            console.log(`  Running: ${status.running}`);
            console.log(`  Daily tasks: ${status.dailyTaskCount}/${status.dailyTaskLimit}`);
            console.log(`  Daily spend: $${status.dailySpendUsd.toFixed(2)}/$${status.budgetCapUsd.toFixed(2)}`);
            console.log(`  Pending proposals: ${status.pendingProposals}`);
            console.log(`  Require approval: ${status.requireApproval}`);
            console.log(`  Allowed actions: ${status.allowedActions.join(', ')}`);
          }
          break;
        }
      }

      client.disconnect();
    } catch (error) {
      console.error(`Failed: ${error.message}`);
      process.exit(1);
    }
  }

  async schedule() {
    if (!this.isDaemonRunning()) {
      console.error('Daemon is not running');
      process.exit(1);
    }

    try {
      const client = await createClient(SOCKET_PATH);
      const status = await client.request('schedule.status');
      client.disconnect();

      console.log(`Scheduler: ${status.started ? 'running' : 'stopped'}`);
      console.log(`Registered actions: ${status.registeredActions.join(', ')}`);

      if (status.jobHistory.length > 0) {
        console.log('\nJob history:');
        for (const job of status.jobHistory) {
          console.log(`  ${job.jobId}: ${job.action} (runs: ${job.runCount}, last: ${job.lastRun})`);
        }
      }
    } catch (error) {
      console.error(`Failed: ${error.message}`);
      process.exit(1);
    }
  }

  async memory() {
    const subcommand = process.argv[3];

    switch (subcommand) {
      case 'show': {
        const scope = this.flags.scope;

        if (this.isDaemonRunning()) {
          // Live: query daemon via IPC
          try {
            const client = await createClient(SOCKET_PATH);
            const result = await client.request('memory.show', scope ? { scope } : {});
            client.disconnect();
            this._printMemoryShow(result);
            return;
          } catch {
            // Fallback to offline read below
          }
        }

        // Offline: read files directly
        const { MemoryManager } = await import('./memory-manager.mjs');
        const mgr = new MemoryManager();
        this._printMemoryShow(mgr.show(scope));
        break;
      }

      case 'clear': {
        const scope = this.flags.scope;
        if (!scope) {
          console.error('Usage: aiwg daemon memory clear --scope <session|project|user>');
          process.exit(1);
        }

        if (this.isDaemonRunning()) {
          try {
            const client = await createClient(SOCKET_PATH);
            const result = await client.request('memory.clear', { scope });
            client.disconnect();
            console.log(`Cleared ${result.cleared} entry/entries from ${scope} scope`);
            return;
          } catch (error) {
            console.error(`IPC failed, attempting offline clear: ${error.message}`);
          }
        }

        // Offline clear
        const { MemoryManager } = await import('./memory-manager.mjs');
        const mgr = new MemoryManager();
        try {
          const result = mgr.clear(scope);
          console.log(`Cleared ${result.cleared} entry/entries from ${scope} scope`);
        } catch (error) {
          console.error(`Failed to clear memory: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      default:
        console.log(`
Usage: aiwg daemon memory <subcommand> [options]

Subcommands:
  show              Show memory contents (all scopes or filtered by --scope)
  clear             Clear memory entries (requires --scope)

Options:
  --scope <scope>   Memory scope: session | project | user

Examples:
  aiwg daemon memory show
  aiwg daemon memory show --scope user
  aiwg daemon memory clear --scope session
  aiwg daemon memory clear --scope project
        `.trim());
        if (subcommand) process.exit(1);
    }
  }

  _printMemoryShow(result) {
    const scopes = ['session', 'project', 'user'];
    let any = false;

    for (const scope of scopes) {
      const info = result[scope];
      if (!info) continue;

      console.log(`\n${scope.toUpperCase()} MEMORY`);
      if (info.path) console.log(`  Path: ${info.path}`);
      console.log(`  Entries: ${info.count}`);

      if (info.entries && info.entries.length > 0) {
        for (const e of info.entries) {
          const name = e.name || e.key || '(unnamed)';
          const desc = e.description ? ` — ${e.description}` : '';
          console.log(`    • ${name}${desc}`);
        }
        any = true;
      }
    }

    if (!any) console.log('\n(no memory entries)');
  }

  async task() {
    const subcommand = process.argv[3];
    const args = process.argv.slice(4);

    switch (subcommand) {
      case 'submit': {
        if (!this.isDaemonRunning()) {
          console.error('Daemon is not running. Start with: aiwg daemon start');
          process.exit(1);
        }

        const prompt = args.join(' ');
        if (!prompt) {
          console.error('Usage: aiwg daemon task submit <prompt>');
          process.exit(1);
        }

        try {
          const client = await createClient(SOCKET_PATH);
          const result = await client.request('task.submit', {
            prompt,
            agent: this.flags.agent,
            priority: this.flags.priority ? parseInt(this.flags.priority, 10) : 0,
          });
          client.disconnect();
          console.log(`Task submitted: ${result.taskId} (${result.state})`);
        } catch (error) {
          console.error(`Failed to submit task: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      case 'list': {
        if (!this.isDaemonRunning()) {
          console.error('Daemon is not running');
          process.exit(1);
        }

        try {
          const client = await createClient(SOCKET_PATH);
          const tasks = await client.request('task.list', {
            state: this.flags.state,
            limit: this.flags.limit ? parseInt(this.flags.limit, 10) : 20,
          });
          client.disconnect();

          if (!tasks || tasks.length === 0) {
            console.log('No tasks found');
            return;
          }

          console.log(`${'ID'.padEnd(12)} ${'State'.padEnd(12)} ${'Prompt'.padEnd(50)}`);
          console.log('-'.repeat(74));
          for (const task of tasks) {
            const prompt = (task.prompt || '').slice(0, 48);
            console.log(`${(task.id || '').padEnd(12)} ${(task.state || '').padEnd(12)} ${prompt}`);
          }
        } catch (error) {
          console.error(`Failed to list tasks: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      case 'get': {
        const taskId = args[0];
        if (!taskId) {
          console.error('Usage: aiwg daemon task get <taskId>');
          process.exit(1);
        }

        if (!this.isDaemonRunning()) {
          console.error('Daemon is not running');
          process.exit(1);
        }

        try {
          const client = await createClient(SOCKET_PATH);
          const task = await client.request('task.get', { taskId });
          client.disconnect();
          console.log(JSON.stringify(task, null, 2));
        } catch (error) {
          console.error(`Failed to get task: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      case 'cancel': {
        const taskId = args[0];
        if (!taskId) {
          console.error('Usage: aiwg daemon task cancel <taskId>');
          process.exit(1);
        }

        if (!this.isDaemonRunning()) {
          console.error('Daemon is not running');
          process.exit(1);
        }

        try {
          const client = await createClient(SOCKET_PATH);
          const result = await client.request('task.cancel', { taskId });
          client.disconnect();
          console.log(result.cancelled ? `Task ${taskId} cancelled` : `Task ${taskId} not found or already completed`);
        } catch (error) {
          console.error(`Failed to cancel task: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      case 'stats': {
        if (!this.isDaemonRunning()) {
          console.error('Daemon is not running');
          process.exit(1);
        }

        try {
          const client = await createClient(SOCKET_PATH);
          const stats = await client.request('task.stats');
          client.disconnect();
          console.log(JSON.stringify(stats, null, 2));
        } catch (error) {
          console.error(`Failed to get stats: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      default:
        console.log(`
Usage: aiwg daemon task <subcommand> [options]

Subcommands:
  submit <prompt>    Submit a new agent task
  list               List tasks
  get <taskId>       Get task details
  cancel <taskId>    Cancel a task
  stats              Show task statistics

Options:
  --agent <name>     Agent type for task submission
  --priority <n>     Task priority (0=default, higher=sooner)
  --state <state>    Filter tasks by state (queued, running, completed, failed)
  --limit <n>        Max tasks to list (default: 20)
        `.trim());
        if (subcommand) process.exit(1);
    }
  }

  isDaemonRunning() {
    if (!fs.existsSync(PID_FILE)) {
      return false;
    }

    const pid = this.readPidFile();
    return this.isPidAlive(pid);
  }

  isPidAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  readPidFile() {
    try {
      return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    } catch (error) {
      return null;
    }
  }

  ensureDirectories() {
    const dirs = [
      '.aiwg',
      '.aiwg/daemon',
      '.aiwg/daemon/actions',
      '.aiwg/daemon/events'
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  cleanup() {
    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  usage() {
    console.log(`
Usage: aiwg daemon <command> [options]

Commands:
  init [profile]    Initialize daemon config from profile (default: manager)
  start             Start the daemon
  stop              Stop the daemon
  status            Show daemon status (live via IPC when available)
  logs              Show daemon logs
  restart           Restart the daemon
  attach            Open tmux session with chat REPL and status pane
  chat <message>    Send a message to the daemon agent
  task <sub>        Manage agent tasks (submit, list, get, cancel, stats)
  rooms             List connected messaging rooms
  autonomous <sub>  Manage autonomous mode (status, enable, disable)
  schedule          Show scheduled task status and history
  memory <sub>      Manage cross-session memory (show, clear)

Options:
  --foreground      Run in foreground (for Docker/systemd)
  --docker          Start daemon in Docker container
  --force           Overwrite existing config (for init)
  --lines N         Show last N lines of logs (default: 50)
  --follow, -f      Follow log output in real-time
  --readonly        Attach to tmux in read-only mode

Examples:
  aiwg daemon init                     # Initialize with manager profile
  aiwg daemon init list                # List available profiles
  aiwg daemon start
  aiwg daemon start --docker           # Start in Docker container
  aiwg daemon start --foreground
  aiwg daemon stop
  aiwg daemon status
  aiwg daemon rooms                    # List messaging rooms
  aiwg daemon autonomous status        # Check autonomous mode
  aiwg daemon autonomous enable        # Enable self-directed thinking
  aiwg daemon schedule                 # Show scheduled tasks
  aiwg daemon attach
  aiwg daemon chat "Review the latest PR"
  aiwg daemon task submit "Run security audit"
  aiwg daemon task list
  aiwg daemon logs --follow
  aiwg daemon restart
  aiwg daemon memory show
  aiwg daemon memory clear --scope session
    `.trim());
  }
}

const cli = new DaemonCLI();
cli.run().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
