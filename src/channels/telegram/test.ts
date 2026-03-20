import { Bot } from 'grammy';

export async function testTelegramToken(botToken: string): Promise<{
  success: boolean;
  botInfo: {
    id: number;
    username?: string;
    firstName: string;
  };
}> {
  const bot = new Bot(botToken);
  
  try {
    const me = await bot.api.getMe();
    return {
      success: true,
      botInfo: {
        id: me.id,
        username: me.username,
        firstName: me.first_name,
      },
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Telegram token validation failed: ${err.message}`);
  }
}
