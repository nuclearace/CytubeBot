import {COMMANDS as API_COMMANDS} from './api.js';
import {COMMANDS as ASCII_COMMANDS} from './ascii.js';
import {COMMANDS as COOKIE_COMMANDS} from './cookie.js';
import {COMMANDS as CUSTOM_COMMANDS} from './custom.js';
import {COMMANDS as DEBUG_COMMANDS} from './debug.js';
import {COMMANDS as DEFAULT_COMMANDS} from './default.js';
import {COMMANDS as GAMBA_COMMANDS} from './gamba.js';
import {COMMANDS as PING_COMMANDS} from './ping.js';
import {COMMANDS as STATS_COMMANDS} from './stats.js';

/** @typedef {import('../cytubebot.js').CytubeBot} CytubeBot */

/**
 * @callback Handler
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} msg The message to handle, not including the command.
 */

/**
 * All sets of chat commands.
 *
 * @type {!Array<Map<string, !Handler>>}
 */
const ALL_COMMANDS = [
  API_COMMANDS,
  ASCII_COMMANDS,
  COOKIE_COMMANDS,
  CUSTOM_COMMANDS,
  DEFAULT_COMMANDS,
  DEBUG_COMMANDS,
  GAMBA_COMMANDS,
  PING_COMMANDS,
  STATS_COMMANDS,
];

/**
 * Handle a chat message.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} msg The message being handled, including the command.
 * @return {?} The return value of the chat message's handler, or null.
 */
export function handleChatMessage(bot, username, msg) {
  const commands = msg.split(' ');
  const command = commands.splice(0, 1)[0].substring(1);
  const msgWithoutCommand = commands.join(' ');

  for (const handlerSet of ALL_COMMANDS) {
    if (!handlerSet.has(command)) {
      continue;
    }

    const handler = handlerSet.get(command);
    return handler(bot, username, msgWithoutCommand);
  }
}
