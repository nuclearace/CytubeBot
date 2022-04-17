/**
 * Commands that ping users.
 */

import {randomInt} from 'crypto';

import {Rank} from '../constants.js';

/** @typedef {import('./handle.js').Handler} Handler */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
export const COMMANDS = new Map();

COMMANDS.set('admins', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} doesn't have permission to ping $admins FeelsWeirdMan`);
    return;
  }

  const pingableUsers = bot.userlist.filter((user) => user.name !== bot.username)
                            .filter((user) => user.rank > Rank.MOD)
                            .map((user) => user.name);
  const ping = pingableUsers.join(' ');

  bot.sendChatMsg(`DonkDink DinkDonk ${ping} Donk`);
});

COMMANDS.set('here', async (bot, username, msg) => {
  if (!await bot.db.moduleIsEnabled('here')) {
    bot.sendChatMsg('here module is disabled. To enable, use $module here on');
    return;
  }

  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    if (!bot.hereGlobalLimiter.tryRemoveTokens(1)) {
      return bot.sendPm(username, '$here ping is on cooldown');
    }
  }

  const pingableUsers = bot.userlist.filter((user) => user.name !== bot.username)
                            .filter((user) => user.name !== 'JohnRG123')
                            .filter((user) => !user.meta.afk)
                            .map((user) => user.name);
  const ping = pingableUsers.join(' ');

  bot.sendChatMsg(`DonkDink DinkDonk ${ping} Donk`);
});

COMMANDS.set('everyone', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} doesn't have permission to ping $everyone FeelsWeirdMan`);
    return;
  }

  const pingableUsers =
      bot.userlist.filter((user) => user.name !== bot.username).map((user) => user.name);
  const ping = pingableUsers.join(' ');

  bot.sendChatMsg(`DonkDink DinkDonk ${ping} Donk`);
});

COMMANDS.set('mods', async (bot, username, msg) => {
  if (!await bot.db.moduleIsEnabled('mping')) {
    bot.sendChatMsg('mping module is disabled. To enable, use $module mping on');
    return;
  }

  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    if (!bot.modscmdGlobalLimiter.tryRemoveTokens(1)) {
      return bot.sendPm(username, '$mods ping is on cooldown');
    }
  }

  const pingableUsers = bot.userlist.filter((user) => user.name !== bot.username)
                            .filter((user) => user.rank === Rank.MOD)
                            .map((user) => user.name);
  const ping = pingableUsers.join(' ');

  bot.sendChatMsg(`DonkDink DinkDonk ${ping} Donk`);
});

COMMANDS.set('ping', async (bot, username, msg) => {
  bot.sendChatMsg(`${username}: MrDestructoid Donk`);
});

COMMANDS.set('rngping', async (bot, username, msg) => {
  const randomIndex = randomInt(bot.userlist.length - 1);
  const randomUser = bot.userlist[randomIndex];
  bot.sendChatMsg(`${randomUser.name}: MrDestructoid Donk`);
});

COMMANDS.set('staff', async (bot, username, msg) => {
  if (!await bot.db.moduleIsEnabled('staff')) {
    bot.sendChatMsg('staff module is disabled. To enable, use $module staff on');
    return;
  }

  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} doesn't have permission to ping $staff FeelsWeirdMan`);
    return;
  }

  const pingableUsers = bot.userlist.filter((user) => user.name !== bot.username)
                            .filter((user) => user.rank >= Rank.MOD)
                            .map((user) => user.name);
  const ping = pingableUsers.join(' ');

  bot.sendChatMsg(`DonkDink DinkDonk ${ping} Donk`);
});
