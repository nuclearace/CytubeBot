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
 */

export const /** @type {!Map<string, Handler>} */ CUSTOM_HANDLERS = new Map();

CUSTOM_HANDLERS.set('cock', (bot, username, msg) => {
  const max = 14;
  const length = Math.round(Math.random() * max);

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

CUSTOM_HANDLERS.set('gn', (bot, username, msg) => {
  bot.sendChatMsg(`FeelsOkayMan <3 gn ${username}`);
});

CUSTOM_HANDLERS.set('pyramid', async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  if (!bot.pyramidLimiter.tryRemoveTokens(1)) {
    return bot.sendPM(username, '$pyramid is on cooldown');
  }

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

CUSTOM_HANDLERS.set('spam', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, 2, null))) {
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

CUSTOM_HANDLERS.set('tuck', (bot, username, msg) => {
  const target = msg.split(' ')[0];
  if (target === '') {
    bot.sendChatMsg(
        `${username}, who do you want to tuck in? FeelsOkayMan ` +
        'Example: $tuck MrDestructoidCyDJ');
  }

  bot.sendChatMsg(`Bedge ${username} tucks ${target} into bed.`);
});


/**
 * Handle a custom chat message.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} command The command to handle.
 * @param {string} msg The message being handled, without the command.
 * @return {?} The return value of the chat message's handler, or null.
 */
export function handle(bot, username, command, msg) {
  if (!CUSTOM_HANDLERS.has(command)) {
    return;
  }

  const handler = CUSTOM_HANDLERS.get(command);
  return handler(bot, username, msg);
}
