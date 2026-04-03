/**
 * @aiwg Chat Participant Handler
 *
 * Registers the @aiwg participant in the Copilot Chat sidebar.
 * Routes /deploy, /status, /skill, /pipeline, /eval, /productionize
 * to the LM API skill runner.
 *
 * VS Code Chat Participant API: https://code.visualstudio.com/api/extension-guides/chat
 * Language Model API: https://code.visualstudio.com/api/extension-guides/language-model
 */

import * as vscode from 'vscode';
import { AiwgCliRunner } from '../cli/runner';

const PARTICIPANT_ID = 'aiwg.assistant';

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  runner: AiwgCliRunner
): void {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    return handleRequest(request, chatContext, stream, token, runner);
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'aiwg-icon.png');

  context.subscriptions.push(participant);
}

async function handleRequest(
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  runner: AiwgCliRunner
): Promise<vscode.ChatResult> {
  const command = request.command ?? 'skill';
  const prompt = request.prompt.trim();

  switch (command) {
    case 'status':
      return handleStatus(stream, runner, token);
    case 'deploy':
      return handleDeploy(stream, runner, prompt, token);
    case 'skill':
      return handleSkill(stream, runner, prompt, token);
    case 'pipeline':
      return handleSkill(stream, runner, `pipeline-design ${prompt}`, token);
    case 'eval':
      return handleSkill(stream, runner, `eval-workflow ${prompt}`, token);
    case 'productionize':
      return handleSkill(stream, runner, `productionize ${prompt}`, token);
    default:
      stream.markdown(`Unknown command \`/${command}\`. Try \`@aiwg /status\`, \`@aiwg /skill <name>\`, or \`@aiwg /deploy\`.`);
      return {};
  }
}

async function handleStatus(
  stream: vscode.ChatResponseStream,
  runner: AiwgCliRunner,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  if (!runner.cliPath) {
    stream.markdown('**AIWG CLI not found.**\n\nRun `AIWG: Install CLI` from the command palette to install.');
    return {};
  }
  stream.progress('Fetching AIWG project status...');
  const result = await runner.run(['status']);
  if (token.isCancellationRequested) return {};
  if (result.exitCode !== 0) {
    stream.markdown(`**Error fetching status:**\n\`\`\`\n${result.stderr}\n\`\`\``);
  } else {
    stream.markdown('**AIWG Project Status**\n\n```\n' + result.stdout + '\n```');
  }
  return {};
}

async function handleDeploy(
  stream: vscode.ChatResponseStream,
  runner: AiwgCliRunner,
  framework: string,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  if (!runner.cliPath) {
    stream.markdown('**AIWG CLI not found.** Cannot deploy without CLI.');
    return {};
  }
  const fw = framework || 'sdlc';
  stream.progress(`Deploying ${fw} framework...`);
  const result = await runner.run(['use', fw]);
  if (token.isCancellationRequested) return {};
  if (result.exitCode !== 0) {
    stream.markdown(`**Deploy failed:**\n\`\`\`\n${result.stderr}\n\`\`\``);
  } else {
    stream.markdown(`**Deployed \`${fw}\`**\n\n\`\`\`\n${result.stdout}\n\`\`\``);
  }
  return {};
}

async function handleSkill(
  stream: vscode.ChatResponseStream,
  runner: AiwgCliRunner,
  skillAndPrompt: string,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  // Try LM API path first (no CLI required)
  const config = vscode.workspace.getConfiguration('aiwg');
  const modelFamily = config.get<string>('chat.defaultModel') ?? 'claude-sonnet';

  let models: readonly vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelFamily });
  } catch {
    // LM API not available
  }

  if (!models.length) {
    // Fallback: try gpt-4o
    try {
      models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
    } catch {
      // Still not available
    }
  }

  if (models.length) {
    return runViaLmApi(stream, models[0], skillAndPrompt, token);
  }

  // Fallback: run via CLI if available
  if (runner.cliPath) {
    return runViaCli(stream, runner, skillAndPrompt, token);
  }

  stream.markdown(
    'No Copilot model available and AIWG CLI not found.\n\n' +
    'Enable GitHub Copilot or install the AIWG CLI (`AIWG: Install CLI`).'
  );
  return {};
}

async function runViaLmApi(
  stream: vscode.ChatResponseStream,
  model: vscode.LanguageModelChat,
  skillAndPrompt: string,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const systemContext = `You are AIWG Assistant — an expert in AI writing quality, SDLC workflows, inference pipeline design, and agent orchestration. Help the user with: ${skillAndPrompt}`;

  const messages = [
    vscode.LanguageModelChatMessage.User(systemContext)
  ];

  try {
    const response = await model.sendRequest(messages, {}, token);
    for await (const chunk of response.text) {
      stream.markdown(chunk);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`**Error:** ${msg}`);
  }

  return {};
}

async function runViaCli(
  stream: vscode.ChatResponseStream,
  runner: AiwgCliRunner,
  skillAndPrompt: string,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  const parts = skillAndPrompt.split(' ');
  const skillName = parts[0];
  const args = parts.slice(1);

  stream.progress(`Running skill \`${skillName}\`...`);
  const result = await runner.run(['skill', skillName, ...args]);
  if (token.isCancellationRequested) return {};

  if (result.exitCode !== 0) {
    stream.markdown(`**Skill error:**\n\`\`\`\n${result.stderr}\n\`\`\``);
  } else {
    stream.markdown(result.stdout);
  }
  return {};
}
