import { normalizeMessage } from './normalizer.mjs';
import { formatResponse } from './formatter.mjs';

const COMMANDS = {
  '/help': handleHelp,
  '/model': handleModel,
  '/newsesh': handleNewSession,
  '/status': handleStatus,
  '/restart': handleRestart,
};

export async function handleCommands(ctx, runtime, channel) {
  const text = ctx.message.text.trim();
  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = COMMANDS[command];
  if (!handler) {
    await ctx.reply(`Unknown command: ${command}\nType /help for available commands.`);
    return true;
  }

  try {
    await handler(ctx, args, runtime, channel);
  } catch (err) {
    console.error(`[Telegram] Command error (${command}):`, err);
    await ctx.reply('Command failed. Check logs for details.');
  }

  return true;
}

async function handleHelp(ctx) {
  const help = [
    '🐾 OpenPaw Commands:',
    '',
    '/help          - Show this message',
    '/model [id]    - Show or switch model',
    '/newsesh       - Start a new session',
    '/status        - Show session & model info',
    '/restart       - Restart the runtime',
  ].join('\n');
  await ctx.reply(help);
}

async function handleModel(ctx, args, runtime) {
  if (args.length === 0) {
    const currentModel = runtime.getCurrentModel();
    await ctx.reply(`Current model: ${currentModel || 'not set'}\n\nUsage: /model <model-id>`);
    return;
  }

  const modelId = args[0];
  const userId = ctx.from.id.toString();
  const sessionId = `telegram-${userId}-${channel.getSessionSuffix()}`;

  try {
    runtime.setSessionModel(sessionId, modelId);
    await ctx.reply(`Model switched to: ${modelId}`);
  } catch (err) {
    await ctx.reply(`Failed to switch model: ${err.message}`);
  }
}

async function handleNewSession(ctx, args, runtime, channel) {
  const userId = ctx.from.id.toString();
  const random = Math.random().toString(36).substring(2, 6);
  const newSessionId = `telegram-${userId}-${random}`;

  const oldSessionId = `telegram-${userId}-${channel.getSessionSuffix()}`;
  runtime.clearSession(oldSessionId);

  // Update channel config to use new session suffix
  channel.config.sessionSuffix = random;

  await ctx.reply(`New session started: ${newSessionId}`);
}

async function handleStatus(ctx, args, runtime, channel) {
  const userId = ctx.from.id.toString();
  const sessionId = `telegram-${userId}-${channel.getSessionSuffix()}`;
  const session = runtime.getSession(sessionId);
  const model = runtime.getCurrentModel();

  const status = [
    '🐾 Status:',
    `Session: ${sessionId}`,
    `Model: ${model || 'not set'}`,
    `Messages: ${session?.messages?.length || 0}`,
    `Workspace: ${runtime.getWorkspaceName()}`,
  ].join('\n');

  await ctx.reply(status);
}

async function handleRestart(ctx, args, runtime) {
  await ctx.reply('Restarting runtime...');
  await runtime.restart();
}
