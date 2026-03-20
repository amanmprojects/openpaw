import type { Message, ContentPart } from '../../types/index.js';

type TelegramMessage = {
  text?: string;
  photo?: Array<{ file_id: string }>;
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
  };
  voice?: {
    duration: number;
  };
  video?: {
    duration: number;
  };
  caption?: string;
};

export function normalizeMessage(message: TelegramMessage): Message[] {
  const messages: Message[] = [];

  if (message.text) {
    messages.push({
      role: 'user',
      content: message.text,
    });
  } else if (message.photo && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1];
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: message.caption || '[Photo]',
        },
        {
          type: 'image',
          image: photo?.file_id,
        },
      ] as ContentPart[],
    });
  } else if (message.document) {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: message.caption || `[Document: ${message.document.file_name || 'unknown'}]`,
        },
        {
          type: 'file',
          data: message.document.file_id,
          filename: message.document.file_name,
          mediaType: message.document.mime_type || 'application/octet-stream',
        },
      ] as ContentPart[],
    });
  } else if (message.voice) {
    messages.push({
      role: 'user',
      content: `[Voice message: ${message.voice.duration}s]`,
    });
  } else if (message.video) {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: message.caption || `[Video: ${message.video.duration}s]`,
        },
      ] as ContentPart[],
    });
  } else {
    messages.push({
      role: 'user',
      content: `[Unsupported message type]`,
    });
  }

  return messages;
}
