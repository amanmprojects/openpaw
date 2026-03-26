---
name: grammy
description: Use when building or debugging Telegram bots with grammy in this repo (long polling, context, sessions, sending and editing messages).
---

## When to use

- Adding Telegram commands, middleware, or error handling in OpenPaw’s gateway.
- Choosing between long polling (`bot.start()`) and webhooks.
- Replying vs editing messages (e.g. streaming text into one message).

## Core concepts

- **Bot** — constructed with `new Bot(token)`; registers handlers with `bot.on("message:text", ...)`, etc.
- **Context (`ctx`)** — one update; use `ctx.message`, `ctx.chat`, `ctx.reply(text)`, and `ctx.api.*` for raw Telegram Bot API calls.
- **Chat id** — `ctx.chat?.id` identifies a conversation; OpenPaw maps this to a session id `telegram:${chatId}`.
- **Long polling** — `await bot.start()` runs the bot until stopped; good for local dev and simple deployments.

## Sending and editing

- `ctx.reply(body)` sends a new message in the current chat.
- `ctx.api.editMessageText(chatId, messageId, text)` updates an existing message — used for streaming UIs that grow one bubble.

## References

- Official docs: [grammy.dev](https://grammy.dev/)
- Guide (getting started): [grammy.dev/guide](https://grammy.dev/guide/)

## OpenPaw wiring

- Gateway entry: [gateway/telegram/adapter.ts](gateway/telegram/adapter.ts)
- Stream batching / edits: [gateway/telegram/stream-delivery.ts](gateway/telegram/stream-delivery.ts)
