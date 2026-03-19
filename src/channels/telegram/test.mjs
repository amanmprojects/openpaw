import { Bot } from 'grammy';

export async function testTelegramToken(botToken) {
  const bot = new Bot(botToken);
  
  try {
    const me = await bot.api.getMe();
    return {
      success: true,
      botInfo: {
        id: me.id,
        username: me.username,
        firstName: me.first_name
      }
    };
  } catch (error) {
    throw new Error(`Telegram token validation failed: ${error.message}`);
  }
}
