---
name: grammy
description: >-
  Build Telegram bots using the grammY framework (TypeScript/JavaScript). Use
  this skill when asked to create, extend, or debug a Telegram bot with grammY.
  Covers bot setup, command handlers, filter queries, context object, middleware,
  sessions, conversations plugin, inline/reply keyboards, file handling, webhooks
  vs long polling, error handling, and deployment. Trigger phrases: telegram bot,
  grammy bot, bot.on, bot.command, ctx.reply, conversations plugin, inline
  keyboard telegram, webhook grammy.
license: MIT
metadata:
  author: aman.236167101@vcet.edu.in
  version: '1.0'
  docs: https://grammy.dev
---

# grammY — Telegram Bot Framework

grammY is a modern TypeScript/JavaScript framework for building Telegram bots. It runs on Node.js, Deno, and edge runtimes, and maps the full Telegram Bot API with strong type safety.

---

## When to Use This Skill

Load this skill whenever the task involves:

- Creating a new Telegram bot from scratch with grammY
- Adding commands, handlers, or interactive menus to an existing bot
- Setting up sessions, conversations, or multi-step dialogs
- Deploying a bot to a server, serverless function, or edge worker
- Debugging grammY-specific errors or middleware issues
- Working with keyboards, file uploads/downloads, inline queries

---

## Project Setup

### Node.js (TypeScript — recommended)

```bash
mkdir my-bot && cd my-bot
npm init -y
npm install grammy
npm install -D typescript ts-node @types/node
npx tsc --init
```

`tsconfig.json` minimum:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "outDir": "dist"
  }
}
```

### Deno

```ts
import { Bot } from "https://deno.land/x/grammy@v1.38.3/mod.ts";
// Run: deno -IN bot.ts
```

---

## Bot Skeleton

```ts
import { Bot } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("Welcome!"));
bot.command("help",  (ctx) => ctx.reply("I can help you with..."));

bot.on("message", (ctx) => ctx.reply("Got your message!"));

bot.catch((err) => console.error("Bot error:", err));

bot.start();
```

**Rules:**
- Never hardcode the token — always use an environment variable.
- Register `bot.catch()` before `bot.start()`.
- `bot.start()` is for long polling. Do **not** call it when using webhooks.

---

## Context Object (`ctx`)

Every handler receives a fresh `ctx` per update. It bundles update data and API shortcuts.

### Key Properties

| Property | Description |
|----------|-------------|
| `ctx.message` | Original message (may be `undefined`) |
| `ctx.msg` | Shorthand — works for message and channel posts |
| `ctx.chat` | Chat object |
| `ctx.chatId` | Chat ID (number) |
| `ctx.from` | Sender (User object) |
| `ctx.update` | Raw Telegram `Update` |
| `ctx.me` | Bot's own User object |
| `ctx.api` | Full Bot API — same as `bot.api` |

### Key Shortcut Methods

```ts
await ctx.reply("Text");                        // sendMessage to current chat
await ctx.replyWithPhoto(inputFile);            // sendPhoto to current chat
await ctx.deleteMessage();                      // delete triggering message
await ctx.pinMessage();                         // pin triggering message
await ctx.api.sendMessage(chatId, "text");      // manual send to any chat
```

Always prefer `ctx.reply(…)` over `ctx.api.sendMessage(ctx.chatId, …)` inside handlers.

### Narrowing with Has-Checks

```ts
if (ctx.hasCallbackQuery(/action-\d+/)) {
  // ctx.callbackQuery.data is guaranteed to be a string here
}
```

---

## Filter Queries

`bot.on(filterQuery)` listens for specific update types. Queries follow `L1:L2:L3` colon-separated syntax.

### Common Patterns

```ts
bot.on("message");                    // Any message
bot.on("message:text");               // Text-only messages
bot.on("message:photo");              // Photo messages
bot.on("message:voice");              // Voice messages
bot.on("edited_message:text");        // Edited text messages
bot.on("callback_query:data");        // Inline button presses
bot.on("inline_query");               // Inline mode queries
bot.on("my_chat_member");             // Bot blocked/unblocked/added
```

### Shorthands

| Shorthand | Matches |
|-----------|---------|
| `":text"` | `message:text` OR `channel_post:text` |
| `"msg"` | `message` OR `channel_post` |
| `"edit"` | `edited_message` OR `edited_channel_post` |
| `":media"` | `:photo` OR `:video` |
| `":file"` | Any file type (photo, video, audio, doc, etc.) |

### Combining Queries

```ts
// OR — array
bot.on(["message:text", "message:photo"]);

// AND — chaining
bot.on("message:photo").on("::hashtag");   // Photo with hashtag caption
bot.on("::url").on(":forward_origin");     // Forwarded message containing URL
```

### Regex and Hear Helpers

```ts
bot.hears(/hello/i, (ctx) => ctx.reply("Hi!"));
bot.command("start", (ctx) => ctx.reply("Started!"));
bot.callbackQuery("button_pressed", (ctx) => ctx.answerCallbackQuery("Done!"));
```

---

## Middleware

Middleware are functions that process updates in a stack. Install with `bot.use()`.

```ts
import { Context, NextFunction } from "grammy";

async function logger(ctx: Context, next: NextFunction) {
  console.log(`Update: ${ctx.update.update_id}`);
  await next();   // ALWAYS await next()
  console.log("Handler finished");
}

bot.use(logger);                         // Installed first = runs first
bot.command("start", (ctx) => …);
```

**Critical rule:** Always `await next()`. Calling it without `await` causes race conditions, missed messages, and crashes.

### Composer (Sub-router)

```ts
import { Composer } from "grammy";

const admin = new Composer<MyContext>();
admin.command("ban", (ctx) => …);
admin.command("kick", (ctx) => …);

bot.use(admin);
```

### Error Boundaries

```ts
bot.errorBoundary((err, next) => {
  console.error("Isolated error:", err.error);
  // optionally: await next() to resume downstream
}).use(riskyComposer);
```

---

## Custom Context Type (TypeScript)

Extend context to carry extra properties across middleware:

```ts
interface BotConfig {
  isAdmin: boolean;
}

type MyContext = Context & { config: BotConfig };

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(async (ctx, next) => {
  ctx.config = { isAdmin: ctx.from?.id === 123456789 };
  await next();
});

bot.command("admin", (ctx) => {
  if (!ctx.config.isAdmin) return ctx.reply("Forbidden.");
  ctx.reply("Hello, admin!");
});
```

---

## Sessions

Sessions persist data between updates for a user or chat.

### Setup

```ts
import { Bot, Context, session, SessionFlavor } from "grammy";

interface SessionData {
  count: number;
  lastSeen?: number;
}

type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({
  initial: (): SessionData => ({ count: 0 }),
}));
```

### Read and Write

```ts
bot.command("count", async (ctx) => {
  ctx.session.count++;
  await ctx.reply(`Count: ${ctx.session.count}`);
});
```

### Persistent Storage (Production)

```ts
import { freeStorage } from "@grammyjs/storage-free";
// npm install @grammyjs/storage-free

bot.use(session({
  initial: () => ({ count: 0 }),
  storage: freeStorage<SessionData>(bot.token),
}));
```

Other adapters: `@grammyjs/storage-redis`, `@grammyjs/storage-mongo`, `@grammyjs/storage-file`.

### Session Key

```ts
bot.use(session({
  initial: () => ({}),
  getSessionKey: (ctx) => ctx.from?.id.toString(), // per-user (default is per-chat)
}));
```

---

## Conversations Plugin

For multi-step dialogs (collect name → collect age → confirm).

```bash
npm install @grammyjs/conversations
```

### Full Setup

```ts
import { Bot, Context } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "@grammyjs/conversations";

type MyContext = ConversationFlavor<Context>;
type MyConversation = Conversation<MyContext>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(conversations());

async function collectInfo(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("What's your name?");
  const { message: nameMsg } = await conversation.waitFor("message:text");

  await ctx.reply("How old are you?");
  const age = await conversation.form.int({
    otherwise: (ctx) => ctx.reply("Please send a number."),
  });

  await ctx.reply(`Nice to meet you, ${nameMsg.text}! You are ${age} years old.`);
}

bot.use(createConversation(collectInfo));

bot.command("start", (ctx) => ctx.conversation.enter("collectInfo"));
```

### Golden Rule

Any code that behaves differently between runs (DB calls, random, time) **must** be wrapped in `conversation.external()`:

```ts
// WRONG
const user = await db.findUser(ctx.from!.id);

// CORRECT
const user = await conversation.external(() => db.findUser(ctx.from!.id));
```

### Wait Variants

```ts
const ctx       = await conversation.wait();                        // Any update
const textCtx   = await conversation.waitFor("message:text");       // Text only
const photoCtx  = await conversation.waitFor(":photo", {
  otherwise: (c) => c.reply("Send a photo please"),
});
const hearsCtx  = await conversation.waitForHears(/yes|no/i);
const cmdCtx    = await conversation.waitForCommand("confirm");
```

### Form Helpers

```ts
const name   = await conversation.form.text();
const age    = await conversation.form.int();
const choice = await conversation.form.select(["yes", "no", "maybe"]);
const photo  = await conversation.form.photo();
```

### Timeouts

```ts
const ctx = await conversation.wait({ maxMilliseconds: 60_000 }); // 1 minute
```

### Checkpoints (rewind)

```ts
const checkpoint = conversation.checkpoint();
// … later …
await conversation.rewind(checkpoint); // jump back
```

---

## Keyboards

### Inline Keyboard (buttons inside messages)

```ts
import { InlineKeyboard } from "grammy";

const keyboard = new InlineKeyboard()
  .text("Confirm ✅", "confirm")
  .text("Cancel ❌", "cancel")
  .row()
  .url("Visit website", "https://example.com");

await ctx.reply("Make a choice:", { reply_markup: keyboard });

// Handle button press
bot.callbackQuery("confirm", async (ctx) => {
  await ctx.answerCallbackQuery("Confirmed!");
  await ctx.editMessageText("You confirmed.");
});
```

### Reply Keyboard (keyboard replaces text input)

```ts
import { Keyboard } from "grammy";

const keyboard = new Keyboard()
  .text("Option A").row()
  .text("Option B").row()
  .text("Option C")
  .resized()
  .oneTime();

await ctx.reply("Choose an option:", { reply_markup: keyboard });

// Remove keyboard
await ctx.reply("Done.", { reply_markup: { remove_keyboard: true } });
```

### Dynamic Keyboards from Arrays

```ts
const items = ["Apple", "Banana", "Cherry"];
const keyboard = InlineKeyboard.from(
  items.map((item) => [InlineKeyboard.text(item, `pick:${item}`)])
);
```

---

## File Handling

```bash
npm install @grammyjs/files
```

```ts
import { Bot } from "grammy";
import { hydrateFiles } from "@grammyjs/files";

const bot = new Bot(process.env.BOT_TOKEN!);
bot.api.config.use(hydrateFiles(bot.token));

bot.on(":document", async (ctx) => {
  const file = await ctx.getFile();
  const path = await file.download("./downloads/file.pdf");
  await ctx.reply(`Saved to ${path}`);
});
```

---

## Error Handling

```ts
import { GrammyError, HttpError } from "grammy";

bot.catch((err) => {
  const ctx = err.ctx;
  const e   = err.error;

  console.error(`Error on update ${ctx.update.update_id}:`);

  if (e instanceof GrammyError) {
    // Telegram rejected the request (bad parameters, permissions, etc.)
    console.error("Telegram API error:", e.description);
  } else if (e instanceof HttpError) {
    // Network failure reaching Telegram
    console.error("Network error:", e);
  } else {
    console.error("Unknown error:", e);
  }
});
```

---

## Deployment

### Long Polling (development / always-on servers)

```ts
bot.start();   // Connects, polls, processes sequentially
```

Enable debug logging:
```bash
DEBUG=grammy* node dist/bot.js
```

### Webhooks (serverless / Vercel / Cloudflare Workers)

```ts
import express from "express";
import { webhookCallback } from "grammy";

const app = express();
app.use(express.json());
app.post("/webhook", webhookCallback(bot, "express"));
app.listen(3000);

// Register webhook URL once:
await bot.api.setWebhook("https://yourdomain.com/webhook");
```

Supported framework adapters: `express`, `koa`, `fastify`, `hono`, `oak`, `cloudflare`, `aws-lambda`, `azure`, `next-js`.

**Do not call `bot.start()` when using webhooks.**

### High-Throughput Long Polling (grammY Runner)

```bash
npm install @grammyjs/runner
```

```ts
import { run } from "@grammyjs/runner";
run(bot);  // Concurrent processing instead of sequential
```

---

## Useful Plugins Reference

| Plugin | Package | Purpose |
|--------|---------|---------|
| Sessions | built-in | Persist data per user/chat |
| Keyboards | built-in | InlineKeyboard & Keyboard builders |
| Conversations | `@grammyjs/conversations` | Multi-step dialogs |
| Menus | `@grammyjs/menu` | Navigable inline button menus |
| Hydration | `@grammyjs/hydrate` | Methods on returned API objects |
| Files | `@grammyjs/files` | Easy file download/upload |
| Parse Mode | `@grammyjs/parse-mode` | Simplified Markdown/HTML formatting |
| i18n | `@grammyjs/i18n` | Multi-language support |
| Auto-retry | `@grammyjs/auto-retry` | Automatic retry on rate limits |
| Rate Limiter | `@grammyjs/ratelimiter` | Throttle per-user requests |
| Router | `@grammyjs/router` | Route by context state |
| Runner | `@grammyjs/runner` | Concurrent long polling |
| Storage: Redis | `@grammyjs/storage-redis` | Redis session storage |
| Storage: MongoDB | `@grammyjs/storage-mongo` | MongoDB session storage |

---

## Complete Example: Echo Bot with Sessions and Keyboard

```ts
import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";

interface SessionData { messageCount: number }
type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(session({ initial: (): SessionData => ({ messageCount: 0 }) }));

bot.catch((err) => console.error(err));

bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("My stats 📊", "stats")
    .text("Reset ♻️", "reset");
  await ctx.reply("Hello! Send me any message.", { reply_markup: keyboard });
});

bot.callbackQuery("stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`You have sent ${ctx.session.messageCount} messages.`);
});

bot.callbackQuery("reset", async (ctx) => {
  ctx.session.messageCount = 0;
  await ctx.answerCallbackQuery("Reset!");
  await ctx.editMessageText("Counter reset to 0.");
});

bot.on("message:text", async (ctx) => {
  ctx.session.messageCount++;
  await ctx.reply(`Echo: ${ctx.message.text}\n(Message #${ctx.session.messageCount})`);
});

bot.start();
```

---

## Checklist Before Shipping

- [ ] `BOT_TOKEN` stored in environment variable, never committed
- [ ] `bot.catch()` registered before `bot.start()`
- [ ] All middleware `await next()` calls have `await`
- [ ] Session `initial` function returns a **new object** each call (never a shared reference)
- [ ] `conversation.external()` wraps all DB/network/random calls inside conversations
- [ ] `bot.start()` NOT called when using webhooks
- [ ] Webhook URL set via `bot.api.setWebhook(url)` after deploying
- [ ] `ctx.answerCallbackQuery()` always called on `callback_query` handlers
