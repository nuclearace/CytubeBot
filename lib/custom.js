/*
 * This is useful for quick and dirty custom commands.
 * See chatcommands.js for examples on how to add commands.
 */

import {sleep} from './utils.js';

/** @typedef {import('./cytubebot.js').CytubeBot} CytubeBot */

/**
 * @callback Handler
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} msg The message to handle, not including the command.
 * @param {boolean} fromIrc Whether or not the message came from IRC.
 */

export const /** @type {!Map<string, Handler>} */ CUSTOM_HANDLERS = new Map();

CUSTOM_HANDLERS.set('cock', (bot, username, msg, fromIrc) => {
  const length = Math.round(Math.random() * 14);

  let /** @type {string} */ emote;
  if (length > 10) {
    emote = 'gachiHYPER';
  } else if (length < 4) {
    emote = 'forsenLaughingAtYou';
  } else {
    emote = 'gachiGASM';
  }

  bot.sendChatMsg(`${username}'s cock is ${length} inches long ${emote}`);
});

CUSTOM_HANDLERS.set('pyramid', (bot, username, msg, fromIrc) => {
  if (!msg) {
    return;
  }

  if ((new Date().getTime() - bot.timeSinceLastPyramid) / 1000 < 15) {
    return bot.sendPM(username, 'Pyramid cooldown');
  }

  bot.timeSinceLastPyramid = new Date().getTime();
  const word = msg.split(' ')[0];
  bot.sendChatMsg('⠀');
  bot.sendChatMsg(`⠀ ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word}`);
});

CUSTOM_HANDLERS.set('spam', async (bot, username, msg, fromIrc) => {
  if (!msg) {
    return;
  }
  if (!bot.checkPermission(username, 2, null)) {
    return;
  }

  const n = msg.split(' ')[0];
  const rest = msg.slice(2);

  let waitTimeMs = 50;
  if (n > 20) {
    // For spams of >20 messages, the bot crashes unless we rate-limit it to
    // ~120ms between messages.
    waitTimeMs = 120;
  }

  for (let i = 1; i <= n; i++) {
    await sleep(i * waitTimeMs);
    bot.sendChatMsg(rest);
  }
});

/**
 * Handle a custom chat message.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} command The command to handle.
 * @param {string} msg The message being handled, without the command.
 * @param {boolean} fromIrc Whether or not the message came from IRC.
 * @return {?} The return value of the chat message's handler, or null.
 */
export function handle(bot, username, command, msg, fromIrc) {
  if (!CUSTOM_HANDLERS.has(command)) {
    return;
  }

  const handler = CUSTOM_HANDLERS.get(command);
  return handler(bot, username, msg, fromIrc);
}
