/**
 * Telegram media utilities — download files from Telegram servers and
 * convert them into formats the agent can consume.
 *
 * Handles:
 *  - Photos: downloaded and base64-encoded for vision-capable LLMs
 *  - Voice/audio: OGG file transcribed via bash (whisper CLI if available,
 *    otherwise falls back to a text description with file path)
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import type { Bot } from "grammy";

const DOWNLOAD_TIMEOUT_MS = 30_000;

// ─── File download ────────────────────────────────────────────────────────────

/**
 * Downloads a Telegram file by its `file_id` and returns the raw bytes.
 */
export async function downloadTelegramFile(
  bot: Bot,
  fileId: string,
): Promise<Buffer | null> {
  try {
    const file = await bot.api.getFile(fileId);
    if (!file.file_path) return null;

    const url = `https://api.telegram.org/file/bot${(bot as unknown as { token: string }).token}/${file.file_path}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

// ─── Photo handling ───────────────────────────────────────────────────────────

/**
 * Downloads the largest available photo from a Telegram message and returns
 * a base64 data URI (image/jpeg) for use in a multimodal LLM message.
 */
export async function downloadPhotoAsBase64(
  bot: Bot,
  photoSizes: { file_id: string; width: number; height: number }[],
): Promise<{ dataUri: string; mimeType: string } | null> {
  // Telegram sends multiple sizes; use the largest.
  const largest = [...photoSizes].sort((a, b) => b.width - a.width)[0];
  if (!largest) return null;

  const buf = await downloadTelegramFile(bot, largest.file_id);
  if (!buf) return null;

  const b64 = buf.toString("base64");
  return { dataUri: `data:image/jpeg;base64,${b64}`, mimeType: "image/jpeg" };
}

// ─── Voice transcription ──────────────────────────────────────────────────────

function runWhisper(audioPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    // whisper <file> --output_format txt --model tiny --output_dir /tmp
    const proc = spawn("whisper", [audioPath, "--output_format", "txt", "--model", "tiny", "--output_dir", tmpdir()], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    const t = setTimeout(() => { proc.kill(); resolve(null); }, 60_000);
    proc.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0) { resolve(null); return; }
      // whisper writes <basename>.txt next to the audio
      const txtPath = audioPath.replace(/\.[^.]+$/, ".txt");
      try {
        const text = readFileSync(txtPath, "utf8").trim();
        if (existsSync(txtPath)) unlinkSync(txtPath);
        resolve(text || null);
      } catch { resolve(null); }
    });
    proc.on("error", () => { clearTimeout(t); resolve(null); });
  });
}

/**
 * Downloads a Telegram voice/audio message, attempts Whisper transcription,
 * and returns a user-text representation suitable for `runTurn()`.
 */
export async function transcribeVoiceMessage(
  bot: Bot,
  fileId: string,
  caption?: string,
): Promise<string> {
  const buf = await downloadTelegramFile(bot, fileId);
  if (!buf) {
    return caption
      ? `[voice message — could not download] ${caption}`
      : "[voice message — could not download]";
  }

  // Save to a temp file
  const tmpPath = join(tmpdir(), `openpaw_voice_${Date.now()}.ogg`);
  writeFileSync(tmpPath, buf);

  // Try whisper CLI first
  const whisperText = await runWhisper(tmpPath);
  if (existsSync(tmpPath)) { try { unlinkSync(tmpPath); } catch {} }

  if (whisperText) {
    const prefix = caption ? `[voice + caption: "${caption}"] ` : "[voice message transcription] ";
    return `${prefix}${whisperText}`;
  }

  // Fallback — no transcription available
  const fallback = caption
    ? `[voice message — transcription unavailable. Caption: "${caption}"]`
    : "[voice message — transcription unavailable. Install whisper-cli to enable voice transcription: pip install openai-whisper]";
  return fallback;
}
