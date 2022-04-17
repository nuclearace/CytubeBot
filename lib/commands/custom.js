/**
 * Various custom-type commands.
 */

import random from 'random';

/** @typedef {import('./handle.js').Handler} Handler */

export const /** @type {!Map<string, Handler>} */ COMMANDS = new Map();

const COCK_MAX_LENGTH = 14;

COMMANDS.set('cock', (bot, username, msg) => {
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

COMMANDS.set('gn', (bot, username, msg) => {
  bot.sendChatMsg(`FeelsOkayMan <3 gn ${username}`);
});

/** Function that generates a random number based on a normal distribution. */
const normal = random.normal(/** mu= */ 100, /** sigma= */ 15);

COMMANDS.set('iq', (bot, username, msg) => {
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

COMMANDS.set('pyramid', async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  if (!bot.pyramidLimiter.tryRemoveTokens(1)) {
    return bot.sendPm(username, '$pyramid is on cooldown');
  }

  // Send an invisible character first so all of the pyramid lines are aligned (second and
  // subsequent message in a row are left-aligned in chat)
  bot.sendChatMsg('⠀');

  const word = msg.split(' ')[0];
  bot.sendChatMsg(`⠀ ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word}`);
});

COMMANDS.set('tuck', (bot, username, msg) => {
  const target = msg.split(' ')[0];
  if (target === '') {
    bot.sendChatMsg(
        `${username}, who do you want to tuck in? FeelsOkayMan ` +
        'Example: $tuck MrDestructoidCyDJ');
  }

  bot.sendChatMsg(`Bedge ${username} tucks ${target} into bed.`);
});
