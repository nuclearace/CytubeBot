/**
 * Cookie commands.
 */

import {randomInt} from 'crypto';
import random from 'random';

import {COOKIE_CLAIM_COOLDOWN} from '../cookie.js';
import {plural} from '../utils.js';

/** @typedef {import('../cytubebot.js').CytubeBot} CytubeBot */
/** @typedef {import('./handle.js').Handler} Handler */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
export const COMMANDS = new Map();

const MAX_COOKIES_PER_CLAIM = 5;
const geometric = random.geometric(0.6);
const COOKIE_TYPES = [
  'chocolate chip',
  'peanut butter',
  'oatmeal raisin',
  'shortbread',
  'gingerbread',
  'sugar',
  'snickerdoodle',
  'white chocolate macadamia nut',
  'ginger snap',
  'butter pecan',
];

COMMANDS.set('cookie', async (bot, username, msg) => {
  {
    const userCookie = await bot.cookies.getUserCookie(username);
    if (!userCookie.canClaimCookie()) {
      bot.sendChatMsg(
          `Can't claim yet, wait ${userCookie.nextCookieAt.toRelative().replace('in ', '')}...`);
      return;
    }
  }
  const toClaim = Math.min(Math.round(geometric()), MAX_COOKIES_PER_CLAIM);
  const userCookie = await bot.cookies.claimCookie(username, toClaim);
  const claimedType = COOKIE_TYPES[randomInt(COOKIE_TYPES.length)];

  bot.sendChatMsg(
      `${username} claimed ${toClaim} ${claimedType} cookie${plural(toClaim)}, ` +
      `now has ${userCookie.count} cookie${plural(userCookie.count)}! ` +
      `Cooldown: ${COOKIE_CLAIM_COOLDOWN.toHuman()}...`);
});

COMMANDS.set('cookies', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;
  if (target === '!poof') {
    bot.sendChatMsg('forsenCD Nice try.');
    return;
  }
  const userCookie = await bot.cookies.getUserCookie(target);

  bot.sendChatMsg(`${target} has ${userCookie.count} cookie${plural(userCookie.count)}`);
});
