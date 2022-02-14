/*
 * This is useful for quick and dirty custom commands.
 * See chatcommands.js for examples on how to add commands.
 */

import random from 'random';

import {Rank} from './constants.js';
import {sendMessagesWithRateLimit} from './utils.js';

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

CUSTOM_HANDLERS.set('iq', (bot, username, msg) => {
  const normal = random.normal(/** mu= */ 100, /** sigma= */ 15);
  const iq = Math.round(normal());

  let /** @type {string} */ emote;
  if (iq > 115) {
    emote = ', ah yes 6Head';
  } else if (iq < 85) {
    emote = 'Pepege';
  } else {
    emote = ', average ForsenLookingAtYou';
  }

  bot.sendChatMsg(`${username}'s IQ is ${iq} ${emote}`);
});

CUSTOM_HANDLERS.set('pyramid', async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  if (!bot.pyramidLimiter.tryRemoveTokens(1)) {
    return bot.sendPm(username, '$pyramid is on cooldown');
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
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to spam. FeelsWeirdMan`);
    return;
  }

  const nMsg = msg.split(' ')[0];
  const n = parseInt(nMsg, 10);
  if (isNaN(n)) {
    bot.sendChatMsg(`Failed to parse spam times. Example: $spam 5 PeepoGlad`);
    return;
  }

  const rest = msg.slice(2);

  await sendMessagesWithRateLimit(bot, Array(n).fill(rest));
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
