/*
 * This is useful for quick and dirty custom commands.
 * See chatcommands.js for examples on how to add commands.
 */

import random from 'random';

/** @typedef {import('./cytubebot.js').CytubeBot} CytubeBot */

/**
 * @callback Handler
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} msg The message to handle, not including the command.
 */

export const /** @type {!Map<string, Handler>} */ CUSTOM_HANDLERS = new Map();

const COCK_MAX_LENGTH = 14;

CUSTOM_HANDLERS.set('cock', (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;
  const length = Math.round(Math.random() * COCK_MAX_LENGTH);

  let /** @type {string} */ emote;
  if (length > 10) {
    emote = 'gachiHYPER';
  } else if (length < 4) {
    emote = 'forsenLaughingAtYou';
  } else {
    emote = 'gachiGASM';
  }

  bot.sendChatMsg(`${target}'s cock is ${length} inches long ${emote}`);
});

CUSTOM_HANDLERS.set('gn', (bot, username, msg) => {
  bot.sendChatMsg(`FeelsOkayMan <3 gn ${username}`);
});

/** Function that generates a random number based on a normal distribution. */
const normal = random.normal(/** mu= */ 100, /** sigma= */ 15);

CUSTOM_HANDLERS.set('iq', (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;
  const iq = Math.round(normal());

  let /** @type {string} */ emote;
  if (iq > 115) {
    emote = ', ah yes 6Head';
  } else if (iq < 85) {
    emote = 'Pepege';
  } else {
    emote = ', average ForsenLookingAtYou';
  }

  bot.sendChatMsg(`${target}'s IQ is ${iq} ${emote}`);
});

CUSTOM_HANDLERS.set('pyramid', async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  if (!bot.pyramidLimiter.tryRemoveTokens(1)) {
    return bot.sendPm(username, '$pyramid is on cooldown');
  }

  const word = msg.split(' ')[0];
  bot.sendChatMsg('');
  bot.sendChatMsg(` ${word}`);
  bot.sendChatMsg(` ${word} ${word}`);
  bot.sendChatMsg(` ${word} ${word} ${word}`);
  bot.sendChatMsg(` ${word} ${word} ${word} ${word}`);
  bot.sendChatMsg(` ${word} ${word} ${word}`);
  bot.sendChatMsg(` ${word} ${word}`);
  bot.sendChatMsg(` ${word}`);
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
