import type { Context } from 'grammy';
import type { Gateway } from '../../types/index.js';

interface TelegramChannel {
  getSessionSuffix(): string;
  config: { sessionSuffix?: string };
}

export const COMMANDS_LIST = [
  { command: 'help', description: 'Show available commands' },
  { command: 'model', description: 'Show or switch model' },
  { command: 'newsesh', description: 'Start a new session' },
  { command: 'status', description: 'Show session & model info' },
  { command: 'restart', description: 'Restart the gateway' },
];

export async function handleHelp(ctx: Context): Promise<void> {
  const help = [
    '🐾 OpenPaw Commands:',
    '',
    '/help          - Show this message',
    '/model [id]    - Show or switch model',
    '/newsesh       - Start a new session',
    '/status        - Show session & model info',
    '/restart       - Restart the gateway',
  ].join('\n');
  await ctx.reply(help);
}

export async function handleModel(
  ctx: Context,
  gateway: Gateway,
  channel: TelegramChannel
): Promise<void> {
  const modelId = ctx.match?.toString().trim();
  
  if (!modelId) {
    const currentModel = gateway.getCurrentModel();
    await ctx.reply(`Current model: ${currentModel || 'not set'}\n\nUsage: /model <model-id>`);
    return;
  }

  const userId = ctx.from?.id.toString();
  if (!userId) return;
  
  const sessionId = `telegram-${userId}-${channel.getSessionSuffix()}`;

  try {
    gateway.setSessionModel(sessionId, modelId);
    await ctx.reply(`Model switched to: ${modelId}`);
  } catch (err) {
    const error = err as Error;
    await ctx.reply(`Failed to switch model: ${error.message}`);
  }
}

export async function handleNewSession(
  ctx: Context,
  gateway: Gateway,
  channel: TelegramChannel
): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) return;
  
  const random = Math.random().toString(36).substring(2, 6);
  const newSessionId = `telegram-${userId}-${random}`;

  const oldSessionId = `telegram-${userId}-${channel.getSessionSuffix()}`;
  gateway.clearSession(oldSessionId);

  channel.config.sessionSuffix = random;

  await ctx.reply(`New session started: ${newSessionId}`);
}

export async function handleStatus(
  ctx: Context,
  gateway: Gateway,
  channel: TelegramChannel
): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) return;
  
  const sessionId = `telegram-${userId}-${channel.getSessionSuffix()}`;
  const session = gateway.getSession(sessionId);
  const model = gateway.getCurrentModel();

  const status = [
    '🐾 Status:',
    `Session: ${sessionId}`,
    `Model: ${model || 'not set'}`,
    `Messages: ${(session?.messages as unknown[])?.length || 0}`,
    `Workspace: ${gateway.getWorkspaceName()}`,
  ].join('\n');

  await ctx.reply(status);
}

export async function handleRestart(ctx: Context, gateway: Gateway): Promise<void> {
  await ctx.reply('Restarting gateway...');
  await gateway.restart();
}
