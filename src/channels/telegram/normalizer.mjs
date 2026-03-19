/**
 * Normalize a Telegram message into AI SDK ModelMessage format.
 */
export function normalizeMessage(message) {
  const messages = [];

  if (message.text) {
    messages.push({
      role: 'user',
      content: message.text,
    });
  } else if (message.photo) {
    // Photos come as an array of sizes, take the largest
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
          image: photo.file_id,
        },
      ],
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
      ],
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
      ],
    });
  } else {
    messages.push({
      role: 'user',
      content: `[Unsupported message type]`,
    });
  }

  return messages;
}
