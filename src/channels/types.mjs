/**
 * @interface ChannelAdapter
 * All channel adapters must implement this interface.
 * Built-in channels (telegram, tui) implement it directly.
 * Future plugins (@openpaw/whatsapp, etc.) export an object conforming to this.
 */

/**
 * @typedef {Object} ValidationResponse
 * @property {boolean} success
 * @property {Object} [botInfo] - Channel-specific bot/user info
 */

/**
 * @typedef {Object} ChannelAdapter
 * @property {string} name - Channel identifier (e.g. 'telegram', 'tui')
 * @property {function(config): Promise<ValidationResponse>} test - Validate channel config
 * @property {function(runtime): Promise<void>} start - Start listening for messages
 * @property {function(): Promise<void>} stop - Graceful shutdown
 * @property {function(sessionId, response): Promise<void>} send - Send agent response
 */
