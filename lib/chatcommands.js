// eslint-disable-next-line no-unused-vars
import {AsyncWeather} from '@cicciosgamino/openweather-apis';
import translate from '@vitalets/google-translate-api';
import {exec} from 'child_process';
import {randomInt} from 'crypto';
import {writeFile} from 'fs/promises';
import humanizeDuration from 'humanize-duration';
import moment from 'moment';
import parseDuration from 'parse-duration';
import random from 'random';
import {promisify} from 'util';

import {callAnagram, callWolfram, WEATHER_ABBREVIATION, weatherFromLocation, weatherFromZipCode} from './apiclient.js';
import {Rank, RESTART_TIMES_FILE_NAME} from './constants.js';
import {COOKIE_CLAIM_COOLDOWN} from './cookie.js';
import {handle as customHandle} from './custom.js';
import {PendingDuel} from './gamba.js';
import {auditLog, errorLog, infoLog, monitorErrorLog} from './logger.js';
import {sendHybridModPermissions} from './permissions.js';
import {getRandomChat} from './twitchlogs.js';
import {filterMsg, genericUIDLoop, getCurrentUnixTimestamp, getUser, kill, parseBumpData, parseDeleteData, parseMediaLink, parseUserlimit, plural, sendMessagesWithRateLimit, sendPmsWithRateLimit, sleep} from './utils.js';
import {validateYouTubeVideo} from './validate.js';

const execAsync = promisify(exec);

/** @typedef {import('./cytubebot.js').CytubeBot} CytubeBot */

/**
 * @callback Handler
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} msg The message to handle, not including the command.
 */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
const CHAT_HANDLERS = new Map();

CHAT_HANDLERS.set('acceptduel', async (bot, username, msg) => {
  const duel = bot.gamba.pendingDuels.filter((duel) => duel.target === username).at(0);
  if (!duel) {
    bot.sendChatMsg('No pending duels.');
    return;
  }
  bot.gamba.pendingDuels = bot.gamba.pendingDuels.filter((duel) => duel.target !== username);

  const win = randomInt(0, 2) === 1;

  const winner = win ? duel.target : duel.initiator;
  const loser = win ? duel.initiator : duel.target;

  await bot.db.updateUserPoints(winner, duel.amount);
  await bot.db.updateUserPoints(loser, -duel.amount);

  bot.sendChatMsg(`${winner} won the duel and receives ${duel.amount} points!`);
});

CHAT_HANDLERS.set('add', async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  if (!(await bot.checkPermission(username, Rank.MOD, 'A'))) {
    bot.sendChatMsg(`${username} does not have permission to add. FeelsWeirdMan`);
    return;
  }

  let pos = 'end';
  const splitData = msg.split(' ');

  if (splitData.length === 2) {
    if (splitData[splitData.length - 1] === 'next') {
      pos = 'next';
      splitData.splice(splitData.length - 1, 1);
      msg = splitData.join('');
    }
  }

  const vid = parseMediaLink(msg);
  if (vid.type === 'yt' && bot.youtubeApiKey) {
    const validity = await validateYouTubeVideo(bot, vid.id, vid.type, null);
    if (validity.valid) {
      return;
    } else {
      bot.addVideo(null, null, null, pos, vid);
    }
  } else {
    bot.addVideo(null, null, null, pos, vid);
  }
});

CHAT_HANDLERS.set('addpoints', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to addpoints. FeelsWeirdMan`);
    return;
  }

  const user = msg.split(' ')[0];
  if (!isNaN(parseInt(user, 10))) {
    bot.sendChatMsg(
        'Username must be provided for addpoints. ' +
        'Example: $addpoints airforce2700 100000 PagMan');
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg(
        'Points amount must be provided. ' +
        'Example: $addpoints airforce2700 100');
    return;
  }

  const deltaMsg = msg.split(' ')[1].toLowerCase();
  const delta = deltaMsg === 'all' ? Number.MAX_VALUE : parseInt(deltaMsg, 10);

  await bot.db.updateUserPoints(user, delta);

  const newPoints = await bot.db.getUserPoints(user);
  bot.sendChatMsg(`${user} now has ${newPoints} points`);
});

CHAT_HANDLERS.set('addrandom', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'R'))) {
    bot.sendChatMsg(`${username} does not have permission to addrandom. FeelsWeirdMan`);
    return;
  }

  const num = parseInt(msg, 10);
  if (isNaN(num)) {
    bot.sendChatMsg(`Couldn't parse count. Ex: $addrandom 10`);
    return;
  }

  if (num > 20) {
    return;
  }

  bot.addRandomVideos(num);
});

CHAT_HANDLERS.set('allow', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    return;
  }

  const match = msg.match(/(\w*)/);
  if (!match) {
    return;
  }

  const user = match[1];
  if (user === bot.username) {
    return;
  }

  if (!(await bot.checkPermission(user, Rank.MOD, 'M'))) {
    bot.sendChatMsg(`${username} does not have permission to allow. FeelsWeirdMan`);
    return;
  }

  const caller = getUser(bot, username);
  const rank = await bot.db.getUserRank(user);
  const lesserOrEqualUser = user && caller.rank <= rank;

  if (lesserOrEqualUser && !userAlsoHasPermission) {
    return bot.disallowUser(user, false);
  } else if (lesserOrEqualUser && userAlsoHasPermission) {
    return;
  }

  bot.disallowUser(user, false);
});

CHAT_HANDLERS.set('anagram', async (bot, username, msg) => {
  if ((new Date().getTime() - bot.timeSinceLastAnagram) / 1000 < 5) {
    return bot.sendPm(username, 'Anagram cooldown');
  }

  bot.timeSinceLastAnagram = new Date().getTime();
  if (msg.length < 7) {
    return bot.sendChatMsg('Message too short');
  } else if (msg.length > 30) {
    return bot.sendChatMsg('Message too long');
  }

  let /** @type {string} */ anagram;
  try {
    anagram = await callAnagram(msg);
  } catch (e) {
    errorLog.log(`Failed to get an anagram: ${e}`);
    bot.sendChatMsg('Failed to get an anagram');
    return;
  }

  bot.sendChatMsg(`[${msg}] -> ${anagram}`);
});

CHAT_HANDLERS.set('ask', (bot, username, msg) => {
  const answers = ['Yes', 'No'];
  const answer = answers[randomInt(answers.length)];
  bot.sendChatMsg(`"${msg}"? ${answer}.`);
});

CHAT_HANDLERS.set('autodelete', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to autodelete. FeelsWeirdMan`);
    return;
  }

  bot.blockVideo();
});

CHAT_HANDLERS.set('ban', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'N'))) {
    bot.sendChatMsg(`${username} does not have permission to ban. FeelsWeirdMan`);
    return;
  }

  if (username.toLowerCase() === msg.split(' ')[0].toLowerCase()) {
    return;
  }

  bot.sendChatMsg(`/ban ${msg}`, true);
});

CHAT_HANDLERS.set('blacklist', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to blacklist. FeelsWeirdMan`);
    return;
  }

  bot.blacklistVideo();
  bot.sendChatMsg('Blacklisted current video.');
});

CHAT_HANDLERS.set('blacklistedusers', (bot, username, msg) => {
  bot.listBlacklistedUsers();
});

CHAT_HANDLERS.set('blacklistuser', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.ADMIN, null))) {
    bot.sendChatMsg(`${username} does not have permission to blacklist. FeelsWeirdMan`);
    return;
  }

  const match = msg.match(/(\w*) (true|false)/);
  if (!match) {
    return;
  }

  const user = match[1];
  if (user === bot.username) {
    return;
  }

  const flag = match[2];

  bot.blacklistUser(user, flag === 'true');
});

CHAT_HANDLERS.set('blockedusers', (bot, username, msg) => {
  bot.listBlockedUsers();
});

CHAT_HANDLERS.set('blockuser', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    return;
  }

  const match = msg.match(/(\w*) (true|false)/);
  if (!match) {
    return;
  }

  const user = match[1];
  if (user === bot.username) {
    return;
  }

  const flag = match[2];

  bot.blockUser(user, flag === 'true');
});

CHAT_HANDLERS.set('bump', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'B'))) {
    return;
  }

  const bumpData = parseBumpData(bot, msg);

  if (!bumpData) {
    return;
  }

  genericUIDLoop(bot, bumpData);
});

CHAT_HANDLERS.set('checkplaylist', (bot) => {
  bot.checkPlaylist();
});

CHAT_HANDLERS.set('cleandatabasevideos', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.FOUNDER, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to cleandatabasevideos. ` +
        `FeelsWeirdMan`);
    return;
  }

  bot.cleanDatabaseVideos();
});

CHAT_HANDLERS.set('choose', (bot, username, msg) => {
  if (!msg) {
    return;
  }

  const choices = msg.trim().split(' ');
  const choice = choices[Math.floor(Math.random() * choices.length)];
  bot.sendChatMsg(`[Choose: ${choices.join(' ')} ] ${choice}`);
});

CHAT_HANDLERS.set('clearchat', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(`${username} does not have permission to clearchat. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('/clear', true);
});

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

CHAT_HANDLERS.set('cookie', async (bot, username, msg) => {
  {
    const userCookie = await bot.cookies.getUserCookie(username);
    if (!userCookie.canClaimCookie()) {
      bot.sendChatMsg(
          `Can't claim yet, wait ${userCookie.nextCookieAt.fromNow(/* withoutSuffix= */ true)}...`);
      return;
    }
  }
  const toClaim = Math.min(Math.round(geometric()), MAX_COOKIES_PER_CLAIM);
  const userCookie = await bot.cookies.claimCookie(username, toClaim);
  const claimedType = COOKIE_TYPES[randomInt(COOKIE_TYPES.length)];

  bot.sendChatMsg(
      `${username} claimed ${toClaim} ${claimedType} cookie${plural(userCookie.count)}, ` +
      `now has ${userCookie.count} cookie${plural(userCookie.count)}! ` +
      `Cooldown: ${COOKIE_CLAIM_COOLDOWN.humanize()}...`);
});

CHAT_HANDLERS.set('cookies', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;
  const userCookie = await bot.cookies.getUserCookie(target);

  bot.sendChatMsg(`${target} has ${userCookie.count} cookie${plural(userCookie.count)}`);
});

CHAT_HANDLERS.set('cleverbot', async (bot, username, msg) => {
  if (bot.cleverbot === null) {
    bot.sendChatMsg('Cleverbot not configured');
    return;
  }

  if (!bot.cleverbotLimiter.tryRemoveTokens(1)) {
    bot.sendChatMsg('Out of Cleverbot quota for today FeelsBadMan');
    return;
  }

  const response =
      await new Promise((resolve, reject) => bot.cleverbot.write(msg, resolve, reject));
  if (response.error) {
    errorLog.log(`Cleverbot query failed: ${response.error}`);
    bot.sendChatMsg('Cleverbot query failed');
    return;
  }

  bot.sendChatMsg(response.output);
});

CHAT_HANDLERS.set('currenttime', (bot, username, msg) => {
  const currentTime = Math.round(bot.leaderData.currentTime);
  bot.sendChatMsg(`Current Time: ${currentTime}`);
});

CHAT_HANDLERS.set('declineduel', async (bot, username, msg) => {
  const duel = bot.gamba.pendingDuels.filter((duel) => duel.target === username).at(0);
  if (!duel) {
    bot.sendChatMsg('No pending duels.');
    return;
  }
  bot.gamba.pendingDuels = bot.gamba.pendingDuels.filter((duel) => duel.target !== username);
  bot.sendChatMsg('Declined duel.');
});

CHAT_HANDLERS.set('delete', async (bot, username, msg) => {
  const deleteData = parseDeleteData(bot, username, msg);

  if (username.toLowerCase() === deleteData.name.toLowerCase()) {
    genericUIDLoop(bot, deleteData);
    return;
  }

  if (!(await bot.checkPermission(username, Rank.MOD, 'D'))) {
    bot.sendChatMsg(`${username} does not have permission to delete others' videos. FeelsWeirdMan`);
    return;
  }

  genericUIDLoop(bot, deleteData);
});

CHAT_HANDLERS.set('deletevideos', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.FOUNDER, null))) {
    bot.sendChatMsg(`${username} does not have permission to deletevideos. FeelsWeirdMan`);
    return;
  }

  bot.deleteVideosFromDatabase(msg);
});

CHAT_HANDLERS.set('disallow', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(`${username} does not have permission to disallow. FeelsWeirdMan`);
    return;
  }

  const match = msg.match(/(\w*)/);
  if (!match) {
    return;
  }

  const user = match[1].toLowerCase();
  const caller = getUser(bot, username);

  if (user === bot.username) {
    return;
  }

  if (!(await bot.checkPermission(user, Rank.MOD, 'M'))) {
    return;
  }

  const rank = await bot.db.getUserRank(user);

  const lesserOrEqualUser = user && caller.rank <= rank;

  if (lesserOrEqualUser && !userAlsoHasPermission) {
    return bot.disallowUser(user, true);
  } else if (lesserOrEqualUser && userAlsoHasPermission) {
    return;
  }

  return bot.disallowUser(user, true);
});

CHAT_HANDLERS.set('duel', async (bot, username, msg) => {
  const targetUser = msg.split(' ')[0];
  if (!targetUser) {
    return;
  }

  if (bot.gamba.pendingDuels.filter((duel) => duel.initiator === username).length > 0) {
    bot.sendChatMsg(`${username}: you already have a duel pending`);
    return;
  }
  if (bot.gamba.pendingDuels.filter((duel) => duel.target === targetUser).length > 0) {
    bot.sendChatMsg(`${targetUser} already has a duel pending`);
    return;
  }


  if (!bot.userlist.map((user) => user.name).includes(targetUser)) {
    bot.sendChatMsg(`${targetUser} is not in chat Pepege`);
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to duel with Sadeg`);
    return;
  }
  const targetUserPoints = await bot.db.getUserPoints(targetUser);
  if (targetUserPoints === 0) {
    bot.sendChatMsg(`${targetUser} doesn't have any points to duel with Sadge`);
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg('Points amount must be provided. Example: $duel someone 100');
    return;
  }
  const duelAmountMsg = msg.split(' ')[1].toLowerCase();
  const duelAmount = duelAmountMsg === 'all' ? currentPoints : parseInt(duelAmountMsg, 10);
  if (isNaN(duelAmount)) {
    bot.sendChatMsg('Failed to parse points amount. Example: $duel someone 100');
    return;
  }
  if (duelAmount > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't duel for more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (duelAmount > targetUserPoints) {
    bot.sendChatMsg(
        `${targetUser} doesn't have enough points for that duel FeelsBadMan ` +
        `(they have ${targetUserPoints} points)`);
    return;
  }
  if (duelAmount < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  bot.gamba.pendingDuels.push(new PendingDuel(username, targetUser, duelAmount));
  bot.sendChatMsg(
      `${username} has challenged ${targetUser} to a duel for ${duelAmount} points! ` +
      `Type $acceptduel or $declineduel ` +
      `in the next ${PendingDuel.EXPIRE_AFTER.asSeconds()} seconds.`);
});

CHAT_HANDLERS.set('duplicates', async (bot, username, msg) => {
  if (bot.playlist.length === 0) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'D'))) {
    bot.sendChatMsg(`${username} does not have permission to duplicates. FeelsWeirdMan`);
    return;
  }

  const lookedUp = [];
  let numDeleted = 0;
  const inLookedUp = (vid) => {
    for (const video of lookedUp) {
      if (video.id === vid.media.id && video.type === vid.media.type) {
        return true;
      }
    }
    return false;
  };

  const duplicateUIDs = bot.playlist.map((video) => {
    if (inLookedUp(video)) {
      return video.uid;
    } else {
      lookedUp.push({
        id: video.media.id,
        type: video.media.type,
      });
    }
  });

  // Fix duplicateUIDs.
  duplicateUIDs.forEach((vid, index) => {
    numDeleted++;
    if (typeof duplicateUIDs[index] === 'undefined') {
      numDeleted--;
      return duplicateUIDs.splice(index, 1);
    }
  });

  const deleteData = {
    kind: 'deleteVideo',
    num: 'all',
    uids: duplicateUIDs.reverse(),
  };

  genericUIDLoop(bot, deleteData);
  bot.sendChatMsg(`Deleted: ${numDeleted}`);
});

CHAT_HANDLERS.set('endpoll', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'P'))) {
    bot.sendChatMsg(`${username} does not have permission to endpoll. FeelsWeirdMan`);
    return;
  }

  bot.endPoll();
});

// eslint-disable-next-line valid-jsdoc
const /** @type {Handler} */ emoteCountHandler = async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  let /** @type {string} */ target;
  let /** @type {string} */ emote;
  if (msg.split(' ').length === 2) {
    target = msg.split(' ')[0];
    emote = msg.split(' ')[1];
  } else {
    emote = msg.split(' ')[0];
  }

  if (!bot.channelEmotes.map((emote) => emote.name).includes(emote)) {
    bot.sendChatMsg(`${emote} isn't an emote`);
    return;
  }

  const count = await bot.db.getEmoteCount(emote, target);

  if (target) {
    bot.sendChatMsg(`${target} has used ${emote} ${count} times.`);
  } else {
    bot.sendChatMsg(`${emote} has been used ${count} times.`);
  }
};

CHAT_HANDLERS.set('ecount', emoteCountHandler);
CHAT_HANDLERS.set('emotecount', emoteCountHandler);

CHAT_HANDLERS.set('emotes', (bot, username, msg) => {
  if (!bot.enableWebServer) {
    return bot.sendChatMsg('WebServer not enabled');
  }

  bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/emotes`);
});

CHAT_HANDLERS.set('givepoints', async (bot, username, msg) => {
  const targetUser = msg.split(' ')[0];
  if (!targetUser) {
    return;
  }

  const allUsers = await bot.db.getAllUsers();
  if (!allUsers.includes(targetUser)) {
    bot.sendChatMsg(`User ${targetUser} not found modCheck`);
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to give Sadeg`);
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg(
        'Points amount must be provided. ' +
        'Example: $givepoints airforce2700 100');
    return;
  }
  const givingAmountMsg = msg.split(' ')[1].toLowerCase();
  const givingAmount = givingAmountMsg === 'all' ? currentPoints : parseInt(givingAmountMsg, 10);
  if (isNaN(givingAmount)) {
    bot.sendChatMsg('Failed to parse points amount. Example: $givepoints airforce2700 100');
    return;
  }
  if (givingAmount > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't give more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (givingAmount < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  await bot.db.updateUserPoints(username, -givingAmount);
  await bot.db.updateUserPoints(targetUser, givingAmount);

  bot.sendChatMsg(`${username} gave ${givingAmount} points to ${targetUser} FeelsOkayMan`);
});

CHAT_HANDLERS.set('help', (bot, username, msg) => {
  bot.sendChatMsg('https://github.com/airforce270/CytubeBot/blob/master/README.md#commands');
});

CHAT_HANDLERS.set('internals', (bot, username, msg) => {
  if (!bot.enableWebServer) {
    return bot.sendChatMsg('WebServer not enabled');
  }

  bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/internals`);
});

CHAT_HANDLERS.set('islive', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!bot.twitch) {
    bot.sendChatMsg('Twitch API not configured FeelsBaddestMan');
    return;
  }

  const channel = msg.split(' ')[0];
  if (!channel) {
    bot.sendChatMsg('Channel must be provided. Example: $islive xqcow');
  }

  const isLive = await bot.twitch.isUserLive(channel);
  if (isLive === null) {
    bot.sendChatMsg(`Couldn't find channel ${channel}`);
    return;
  }

  if (isLive) {
    bot.sendChatMsg(`Yes, ${channel} is currently live.`);
  } else {
    bot.sendChatMsg(`No, ${channel} is not currently live.`);
  }
});

CHAT_HANDLERS.set('ipban', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'N'))) {
    bot.sendChatMsg(`${username} does not have permission to ipban. FeelsWeirdMan`);
    return;
  }
  if (username.toLowerCase() === msg.toLowerCase()) {
    return;
  }

  bot.sendChatMsg(`/ipban ${msg}`, true);
});

CHAT_HANDLERS.set('join', async (bot, username, msg) => {
  if (!bot.gamba.raffleInProgress) {
    bot.sendPm(username, 'No raffle in progress');
  }
  bot.gamba.usersInRaffle.add(username);
});

CHAT_HANDLERS.set('kick', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} does not have permission to kick. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg(`/kick ${msg}`, true);
});

CHAT_HANDLERS.set('lasttweet', async (bot, username, msg) => {
  if (!bot.twitter) {
    bot.sendChatMsg('Twitter API not configured FeelsBaddestMan');
    return;
  }

  const target = msg.split(' ')[0];
  if (!target) {
    bot.sendChatMsg('Username must be provided, ex: $lasttweet xQc');
    return;
  }

  if (!bot.twitterLimiter.tryRemoveTokens(5)) {
    bot.sendChatMsg('Out of Twitter API quota, try again later');
    return;
  }

  /** @type {import('./twitter.js').UserV2|null} */
  let user;
  /** @type {import('./twitter.js').TweetV2|null} */
  let lastTweet;
  try {
    user = await bot.twitter.getUser(target);
    if (!user) {
      bot.sendChatMsg(`Couldn't find user`);
      return;
    }
    lastTweet = await bot.twitter.getLastTweet(user);
    if (!lastTweet) {
      bot.sendChatMsg(`Couldn't find the user's last tweet`);
      return;
    }
  } catch (err) {
    errorLog.log(err);
    bot.sendChatMsg(`Twitter API call failed`);
    return;
  }

  const timeSinceTweet = moment(lastTweet.created_at).fromNow();

  bot.sendChatMsg(`[@${user.username}, ${timeSinceTweet}]: ${lastTweet.text}`);
});

CHAT_HANDLERS.set('leaderboard', async (bot, username, msg) => {
  const pageSize = 5;
  const pageMsg = msg.split(' ')[0];
  const pageMsgParsed = pageMsg !== '' ? parseInt(pageMsg, 10) : 1;
  const pageNumber = !isNaN(pageMsgParsed) ? pageMsgParsed : 1;
  const firstRank = ((pageNumber - 1) * pageSize) + 1;

  const page = await bot.db.getLeaderboardPage(pageNumber - 1, pageSize);
  const start = firstRank;
  const end = firstRank + page.length - 1;

  const pmIfUserCountGreaterThan = 50;

  const deliver = bot.userlist.length > pmIfUserCountGreaterThan ?
      (msg) => bot.sendPm(username, msg) :
      (msg) => bot.sendChatMsg(msg);

  if (bot.userlist.length > pmIfUserCountGreaterThan) {
    if (bot.leaderboardLargeChatLimiter.tryRemoveTokens(1)) {
      bot.sendChatMsg(`PMing leaderboard due to high # of users in chat`);
    }
  }

  deliver(`Points leaderboard ${start}-${end}:`);

  for (const [i, user] of page.entries()) {
    const rank = i + firstRank;
    deliver(`#${rank} ${user.points} points: ${user.name}`);
  }

  if (page.length === pageSize) {
    deliver(`For the next page, do $leaderboard ${pageNumber + 1}`);
  }
});

CHAT_HANDLERS.set('listpermissions', (bot, username, msg) => {
  const name = msg || username;
  sendHybridModPermissions(bot, name.toLowerCase());
});

CHAT_HANDLERS.set('logs', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'K'))) {
    bot.sendPm(username, `You do not have permission to logs. FeelsWeirdMan`);
    return;
  }

  const logFileAudit = 'audit';
  const logFileError = 'error';
  const logFileInfo = 'info';
  const logFileMonitorError = 'monitor_error';
  const logFiles = [logFileAudit, logFileError, logFileInfo, logFileMonitorError];

  const fileName = msg.split(' ')[0];
  if (fileName === '') {
    bot.sendPm(username, `Name of log must be provided. Example: $logs error first 5`);
    return;
  }
  if (!logFiles.includes(fileName)) {
    bot.sendPm(
        username, `Name of log must be one of the following: ${logFiles}. Provided: ${fileName}`);
    return;
  }

  const direction = msg.split(' ')[1];
  if (direction === '') {
    bot.sendPm(username, `Direction to search must be provided. Example: $logs error last 10`);
    return;
  }
  const forward = direction === 'first';

  const numberOfLinesMsg = msg.split(' ')[2];
  if (numberOfLinesMsg === '') {
    bot.sendPm(username, `Number of lines must be provided. Example: $logs error last 10`);
    return;
  }
  const numberOfLines = parseInt(numberOfLinesMsg, 10);
  if (isNaN(numberOfLines)) {
    bot.sendPm(username, `Failed to parse number of lines. Example: $logs error last 10`);
    return;
  }

  const lines = [];
  if (fileName === logFileAudit) {
    const data =
        forward ? await auditLog.read(numberOfLines) : await auditLog.readReverse(numberOfLines);
    lines.push(...data);
  } else if (fileName === logFileError) {
    const data =
        forward ? await errorLog.read(numberOfLines) : await errorLog.readReverse(numberOfLines);
    lines.push(...data);
  } else if (fileName === logFileInfo) {
    const data =
        forward ? await infoLog.read(numberOfLines) : await infoLog.readReverse(numberOfLines);
    lines.push(...data);
  } else if (fileName === logFileMonitorError) {
    const data = forward ? await monitorErrorLog.read(numberOfLines) :
                           await monitorErrorLog.readReverse(numberOfLines);
    lines.push(...data);
  } else {
    bot.sendPm(
        username,
        'Log file name didn\'t match any options. ' +
            'This should never happen.');
  }

  sendPmsWithRateLimit(bot, username, lines);
});

CHAT_HANDLERS.set('management', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'G'))) {
    bot.sendChatMsg(`${username} does not have permission to management. FeelsWeirdMan`);
    return;
  }

  if (msg.indexOf('on') !== -1) {
    auditLog.log('!~~~! Bot is now managing the playlist');
    bot.stats.managing = true;
    bot.writePersistentSettings();
  } else if (msg.indexOf('off') !== -1) {
    auditLog.log('!~~~! The bot is no longer managing the playlist');
    bot.stats.managing = false;
    bot.writePersistentSettings();
  }

  if (bot.playlist.length === 0 && bot.stats.managing) {
    bot.addRandomVideos();
  }
});

CHAT_HANDLERS.set('module', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to module. FeelsWeirdMan`);
    return;
  }

  const module = msg.split(' ')[0];

  const enableMsg = msg.split(' ')[1];
  if (enableMsg !== 'on' && enableMsg !== 'off') {
    bot.sendChatMsg(`Failed to determine new module status, should be "on" or "off".`);
    return;
  }
  const enable = enableMsg === 'on';

  bot.db.setModuleEnabled(module, enable);
  bot.sendChatMsg(`${enable ? 'Enabled' : 'Disabled'} module ${module}`);
});

CHAT_HANDLERS.set('modulesoff', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to modulesoff. FeelsWeirdMan`);
    return;
  }

  const modules = await bot.db.getAllModules();
  for (const module of modules) {
    bot.db.setModuleEnabled(module, false);
  }
  bot.sendChatMsg(`Disabled modules: ${modules}`);
});

CHAT_HANDLERS.set('moduleson', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to moduleson. FeelsWeirdMan`);
    return;
  }

  const modules = await bot.db.getAllModules();
  for (const module of modules) {
    bot.db.setModuleEnabled(module, true);
  }
  bot.sendChatMsg(`Enabled modules: ${modules}`);
});

CHAT_HANDLERS.set('mute', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(`${username} does not have permission to mute. FeelsWeirdMan`);
    return;
  }

  if (!bot.stats.muted) {
    bot.stats.muted = !bot.stats.muted;
    auditLog.log(`!~~~! ${username} muted bot`);
    bot.writePersistentSettings();
  }
});

CHAT_HANDLERS.set('nonotifylive', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to nonotifylive. FeelsWeirdMan`);
    return;
  }
  if (!bot.twitch) {
    bot.sendChatMsg('Twitch API not configured FeelsBaddestMan');
    return;
  }

  const channelName = msg.split(' ')[0];
  if (!channelName) {
    bot.sendChatMsg(`Channel name must be provided, ex: $nonotifylive xqcow`);
    return;
  }

  const channel = await bot.twitch.getUser(channelName);
  if (!channel) {
    bot.sendChatMsg(`Couldn't find channel ${channelName}`);
    return;
  }

  await bot.db.setMonitorTwitchChannel(channel.id, channel.name, /* monitor= */ false);

  bot.monitoredTwitchChannels = await bot.db.getMonitoredTwitchChannels();

  bot.sendChatMsg(`Will no longer notify when ${channel.name} goes live.`);
});

CHAT_HANDLERS.set('notifylive', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to notifylive. FeelsWeirdMan`);
    return;
  }
  if (!bot.twitch) {
    bot.sendChatMsg('Twitch API not configured FeelsBaddestMan');
    return;
  }

  const channelName = msg.split(' ')[0];
  if (!channelName) {
    bot.sendChatMsg('Channel name must be provided, ex: $notifylive xqcow');
    return;
  }

  const channel = await bot.twitch.getUser(channelName);
  if (!channel) {
    bot.sendChatMsg(`Couldn't find channel ${channelName}`);
    return;
  }

  await bot.db.setMonitorTwitchChannel(channel.id, channel.name, /* monitor= */ true);

  bot.monitoredTwitchChannels = await bot.db.getMonitoredTwitchChannels();

  const status = (await bot.twitch.isUserLive(channel.name)) ? 'live' : 'not live';
  bot.sendChatMsg(`Will now notify whenever ${channel.name} goes live. (currently ${status})`);
});

CHAT_HANDLERS.set('notifylivelist', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to notifylive. FeelsWeirdMan`);
    return;
  }
  if (!bot.twitch) {
    bot.sendChatMsg('Twitch API not configured FeelsBaddestMan');
    return;
  }
  if (bot.monitoredTwitchChannels.length === 0) {
    bot.sendChatMsg('No Twitch channels will notify chat when they go live');
    return;
  }

  bot.sendChatMsg(
      'Channels that will notify chat when they go live: ' +
      bot.monitoredTwitchChannels.map((channel) => channel.name).join(', '));
});

// eslint-disable-next-line valid-jsdoc
const /** @type {Handler} */ pointsHandler = async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;

  let rank = 1;
  let points = -1;

  let pageNumber = 0;
  const pageSize = 100;
  leaderboardPageLoop: while (true) {
    const page = await bot.db.getLeaderboardPage(pageNumber, pageSize);
    for (const user of page) {
      if (user.name === target) {
        points = user.points;
        break leaderboardPageLoop;
      }
      rank++;
    }

    if (page.length < pageSize) {
      bot.sendChatMsg(`Couldn't find ${target}'s rank`);
      return;
    }

    pageNumber++;
  }

  bot.sendChatMsg(`${target} has ${points} points (rank ${rank})`);
};

CHAT_HANDLERS.set('p', pointsHandler);
CHAT_HANDLERS.set('points', pointsHandler);
CHAT_HANDLERS.set('userpoints', pointsHandler);

CHAT_HANDLERS.set('raffle', async (bot, username, msg) => {
  if (!(await bot.db.moduleIsEnabled('raffle'))) {
    bot.sendChatMsg('Raffle module is disabled. To enable, use $module raffle on');
    return;
  }

  if (bot.gamba.raffleInProgress) {
    bot.sendChatMsg('A raffle is already in progress Pepega');
  }
  if (bot.gamba.raffleLimiter.getTokensRemaining() < 1) {
    bot.sendPm(username, '$raffle is on cooldown');
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to raffle with Sadeg`);
    return;
  }

  const pointsMsg = msg.split(' ')[0];
  if (pointsMsg === '') {
    bot.sendChatMsg(`Points amount must be provided, ex: $raffle 1000`);
    return;
  }
  let /** @type {number} */ points;
  if (pointsMsg === 'all') {
    points = currentPoints;
  } else if (pointsMsg.endsWith('%')) {
    const percent = parseInt(pointsMsg, 10);
    if (isNaN(percent)) {
      bot.sendChatMsg('Failed to parse percent. Example: $raffle 10%');
      return;
    }
    points = Math.floor((percent / 100) * currentPoints);
  } else {
    points = parseInt(pointsMsg, 10);
  }
  if (isNaN(points)) {
    bot.sendChatMsg(`Failed to parse points amount. ex: $raffle 1000`);
    return;
  }

  if (points > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't raffle more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (points < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  await bot.db.updateUserPoints(username, -points);
  await bot.gamba.raffleLimiter.removeTokens(1);
  bot.gamba.raffleInProgress = true;

  const raffleTimeSeconds = 30;

  bot.sendChatMsg(
      `${username} has started a raffle for ${points} points. ` +
      `Type $join in the next ${raffleTimeSeconds} seconds to join!`);

  setTimeout(async () => {
    let /** @type {string} */ winner;
    if (bot.gamba.usersInRaffle.size === 0) {
      winner = username;
      bot.sendChatMsg('No-one joined the raffle...');
    } else {
      const users = Array.from(bot.gamba.usersInRaffle.values());
      winner = users[randomInt(bot.gamba.usersInRaffle.size)];
      bot.sendChatMsg(`${winner} won the raffle and receives ${points} points!`);
    }
    await bot.db.updateUserPoints(winner, points);
    bot.gamba.raffleInProgress = false;
    bot.gamba.usersInRaffle.clear();
  }, raffleTimeSeconds * 1000);
});

CHAT_HANDLERS.set('removepoints', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to removepoints. FeelsWeirdMan`);
    return;
  }

  const user = msg.split(' ')[0];
  if (!isNaN(parseInt(user, 10))) {
    bot.sendChatMsg(
        'Username must be provided for removepoints. Example: $removepoints IP0G 100000 :tf:');
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg('Points amount must be provided. Example: $removepoints IP0G 100');
    return;
  }

  const deltaMsg = msg.split(' ')[1].toLowerCase();
  const delta = deltaMsg === 'all' ? Number.MAX_VALUE : parseInt(deltaMsg, 10);

  await bot.db.updateUserPoints(user, -delta);

  const newPoints = await bot.db.getUserPoints(user);
  bot.sendChatMsg(`${user} now has ${newPoints} points`);
});

CHAT_HANDLERS.set('permissions', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.ADMIN, null))) {
    bot.sendChatMsg(`${username} does not have permission to permissions. FeelsWeirdMan`);
    return;
  }

  const match = msg.trim().match(/^((\+|\-)((ALL)|(.*)) )?(.*)$/);
  let permission = match[1];
  const name = match[6].toLowerCase();

  if (permission) {
    permission = permission.toUpperCase();
  }

  bot.handleHybridModPermissionChange(permission, name);
});

CHAT_HANDLERS.set('ping', async (bot, username, msg) => {
  bot.sendChatMsg(`${username}: MrDestructoid Donk`);
});

// Unlisted command.
CHAT_HANDLERS.set('playlistdebug', (bot, username, msg) => {
  if (msg) {
    return console.log(bot.playlist[msg]);
  }

  console.log(bot.playlist);
});

CHAT_HANDLERS.set('poll', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'P'))) {
    bot.sendChatMsg(`${username} does not have permission to poll. FeelsWeirdMan`);
    return;
  }

  let hidden = false;
  const splitData = msg.split('.');
  if (splitData[splitData.length - 1].toLowerCase().match('true')) {
    hidden = true;
    splitData.splice(splitData.length - 1, 1);
  }

  const title = splitData[0];
  splitData.splice(0, 1);

  const pollData = {
    title: title,
    opts: splitData,
    obscured: hidden,
  };

  bot.createPoll(pollData);
});

CHAT_HANDLERS.set('poof', async (bot, username, msg) => {
  if ((await bot.db.getUserRank(username)) >= Rank.MOD) {
    bot.sendChatMsg('Mods can\'t poof FeelsBadMan');
    return;
  }

  const minLengthSecs = 10;
  const maxLengthSecs = 3 * 60;
  const lengthSecs = randomInt(minLengthSecs, maxLengthSecs);

  const lengthDesc = humanizeDuration(lengthSecs * 1000);
  bot.sendChatMsg(`Poofing ${username} for (RNG) ${lengthDesc} ppPoof`);

  bot.sendChatMsg(`/mute ${username}`, true);

  const end = getCurrentUnixTimestamp() + lengthSecs;
  await bot.db.setUserTimeout(username, end);
});

CHAT_HANDLERS.set('processinfo', (bot) => {
  const info = process.memoryUsage();
  bot.sendChatMsg(`Heap total: ${info.heapTotal} Heap used: ${info.heapUsed}`);
});

CHAT_HANDLERS.set('purge', (bot, username, msg) => {
  if (!msg) {
    msg = username;
  }

  msg = `${msg.trim()} all`;
  CHAT_HANDLERS.get('delete')(bot, username, msg);
});

CHAT_HANDLERS.set('quote', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : null;

  const quote = await bot.db.getQuote(target);
  if (!quote) {
    return;
  }

  const quotedMsg = filterMsg(quote.msg);
  const time = new Date(quote.timestamp);
  const timestamp = time.toDateString() + ' ' + time.toTimeString().split(' ')[0];

  bot.sendChatMsg(`[${quote.username} ${timestamp}] ${quotedMsg}`);
});

CHAT_HANDLERS.set('randomchat', async (bot, username, msg) => {
  const [channel, user] = msg.split(' ');
  if (!channel) {
    bot.sendChatMsg('Channel must be provided, ex: $randomchat xqcow somechatter');
    return;
  }
  if (!user) {
    bot.sendChatMsg('User must be provided, ex: $randomchat xqcow somechatter');
    return;
  }

  let chat;
  try {
    chat = await getRandomChat(channel, user);
  } catch (err) {
    if (err.toString().includes('User or channel has opted out')) {
      bot.sendChatMsg('User or channel has opted out');
      return;
    }
    errorLog.log(err);
    bot.sendChatMsg('TwitchLogs API call failed (does user/channel exist?)');
    return;
  }

  const timeSinceChat = moment(chat.timestamp).fromNow();

  bot.sendChatMsg(`[${chat.channel}/${chat.displayName}, ${timeSinceChat}]: ${chat.text}`);
});

CHAT_HANDLERS.set('randomemote', (bot, username, msg) => {
  const randomIndex = randomInt(bot.channelEmotes.length - 1);
  const randomEmote = bot.channelEmotes[randomIndex];
  bot.sendChatMsg(randomEmote.name);
});

CHAT_HANDLERS.set('rank', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;

  let rank = 1;
  let points = -1;

  let pageNumber = 0;
  const pageSize = 100;
  leaderboardPageLoop: while (true) {
    const page = await bot.db.getLeaderboardPage(pageNumber, pageSize);
    for (const user of page) {
      if (user.name === target) {
        points = user.points;
        break leaderboardPageLoop;
      }
      rank++;
    }

    if (page.length < pageSize) {
      bot.sendChatMsg(`Couldn't find ${target}'s rank`);
      return;
    }

    pageNumber++;
  }

  bot.sendChatMsg(`${target} is rank ${rank} on the leaderboard with ${points} points`);
});

CHAT_HANDLERS.set('resetrestartcount', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'K'))) {
    bot.sendChatMsg(
        `${username} does not have permission to resetrestartcount. ` +
        'FeelsWeirdMan');
    return;
  }

  try {
    await writeFile(RESTART_TIMES_FILE_NAME, '0');
  } catch (e) {
    errorLog.log(e);
    bot.sendChatMsg(`Failed to reset restart count.`);
    return;
  }

  bot.sendChatMsg(`Restart count is now ${await bot.readTimes()}.`);
});

CHAT_HANDLERS.set('restart', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'K'))) {
    bot.sendChatMsg(`${username} does not have permission to restart. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('Restarting, please wait...');
  kill();
});

CHAT_HANDLERS.set('rngban', async (bot, username, msg) => {
  if ((await bot.db.getUserRank(username)) >= Rank.MOD) {
    bot.sendChatMsg('Only non-mods can rngban FeelsOkayMan');
    return;
  }

  bot.sendPm(username, 'https://bit.ly/cydj-rngban-appeal');
  bot.sendChatMsg(`/kick ${username}`, true);
  bot.sendChatMsg(':tf:');
  await sleep(5 * 1000);
  bot.sendPm(username, ':tf:');
});

CHAT_HANDLERS.set('rngkick', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} does not have permission to rngkick. FeelsWeirdMan`);
    return;
  }

  const kickableUsers = bot.userlist.filter((user) => user.name !== bot.username)
                            .filter((user) => user.rank < Rank.MOD)
                            .filter((user) => !user.meta.afk)
                            .map((user) => user.name);
  if (kickableUsers.length === 0) {
    bot.sendChatMsg('No kickable users StareChamp');
    return;
  }
  const userToKick = kickableUsers[randomInt(kickableUsers.length)];

  bot.sendChatMsg(`RNG kicking ${userToKick}, pepeLaugh Boot`);
  bot.sendChatMsg(`/kick ${userToKick}`, true);
});

CHAT_HANDLERS.set('rngping', async (bot, username, msg) => {
  const randomIndex = randomInt(bot.userlist.length - 1);
  const randomUser = bot.userlist[randomIndex];
  bot.sendChatMsg(`${randomUser.name}: MrDestructoid Donk`);
});

CHAT_HANDLERS.set('rngtempban', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} does not have permission to rngtempban. FeelsWeirdMan`);
    return;
  }

  const kickableUsers = bot.userlist.filter((user) => user.name !== bot.username)
                            .filter((user) => user.rank < Rank.MOD)
                            .filter((user) => !user.meta.afk)
                            .map((user) => user.name);
  if (kickableUsers.length === 0) {
    bot.sendChatMsg('No rng-tempban-able users StareChamp');
    return;
  }
  const targetUser = kickableUsers[randomInt(kickableUsers.length)];

  const lengthSecs = parseDuration(msg, /** format= */ 'sec');
  if (isNaN(lengthSecs) || lengthSecs < 0) {
    bot.sendChatMsg('Failed to parse tempban length. Example: $tempban 30s');
    return;
  }

  const lengthDesc = humanizeDuration(lengthSecs * 1000);
  bot.sendChatMsg(`RNG tempbanning ${targetUser} for ${lengthDesc} :tf: Boot`);

  bot.sendChatMsg(`/kick ${targetUser}`, true);

  const end = getCurrentUnixTimestamp() + lengthSecs;
  await bot.db.setUserTempBan(targetUser, end);
});

CHAT_HANDLERS.set('rngtimeout', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to rngtimeout. FeelsWeirdMan`);
    return;
  }

  const kickableUsers = bot.userlist.filter((user) => user.name !== bot.username)
                            .filter((user) => user.rank < Rank.MOD)
                            .filter((user) => !user.meta.afk)
                            .map((user) => user.name);
  if (kickableUsers.length === 0) {
    bot.sendChatMsg('No rng-timeout-able users StareChamp');
    return;
  }
  const targetUser = kickableUsers[randomInt(kickableUsers.length)];

  const lengthSecs = parseDuration(msg, /** format= */ 'sec');
  if (isNaN(lengthSecs) || lengthSecs < 0) {
    bot.sendChatMsg('Failed to parse timeout length. Example: $rngtimeout 30s');
    return;
  }

  const lengthDesc = humanizeDuration(lengthSecs * 1000);
  bot.sendChatMsg(`RNG timing out ${targetUser} for ${lengthDesc} :tf: Boot`);

  bot.sendChatMsg(`/mute ${targetUser}`, true);

  const end = getCurrentUnixTimestamp() + lengthSecs;
  await bot.db.setUserTimeout(targetUser, end);
});

CHAT_HANDLERS.set('roulette', async (bot, username, msg) => {
  if (!(await bot.db.moduleIsEnabled('roulette'))) {
    bot.sendChatMsg('Roulette module is disabled. To enable, use $module roulette on');
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to roulette with Sadeg`);
    return;
  }

  const gambledAmountMsg = msg.split(' ')[0].toLowerCase();
  let /** @type {number} */ gambledPoints;
  if (gambledAmountMsg === 'all') {
    gambledPoints = currentPoints;
  } else if (gambledAmountMsg.endsWith('%')) {
    const percent = parseInt(gambledAmountMsg, 10);
    if (isNaN(percent)) {
      bot.sendChatMsg('Failed to parse roulette percent. Example: $roulette 10%');
      return;
    }
    gambledPoints = Math.floor((percent / 100) * currentPoints);
  } else {
    gambledPoints = parseInt(gambledAmountMsg, 10);
  }
  if (isNaN(gambledPoints)) {
    bot.sendChatMsg('Failed to parse roulette amount. Example: $roulette 5');
    return;
  }

  if (gambledPoints > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't roulette more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (gambledPoints < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  const win = randomInt(100) > (100 - bot.rouletteWinPercentage);
  const delta = win ? gambledPoints : -gambledPoints;
  await bot.db.updateUserPoints(username, delta);

  const newPoints = currentPoints + delta;
  let /** @type {string} */ comment;
  if (newPoints === 0) {
    comment = `-${currentPoints} OMEGALUL`;
  } else if (delta === currentPoints) {
    comment = 'xqcCheer';
  } else {
    comment = win ? 'PagMan' : 'Sadeg';
  }

  bot.sendChatMsg(
      `${username} ${win ? 'won' : 'lost'} ` +
      `${gambledPoints} points in roulette ` +
      `and now has ${newPoints} points! ${comment}`);
});

const SMP_HIGH_TIER_EMOTES = [
  'xqcL',
  'PagMan',
  'TriHard',
  'klaiusGuraRickRoll',
  'FEELSWAYTOOGOOD',
];
const SMP_MID_TIER_EMOTES = [
  'monkaPog',
  'halalChad',
  'PagPls',
  'CrabPls',
  'Okayeg',
  'CaitlynS',
  'veiO',
  'mendoUA',
  'elisNom',
  'mendoUWU',
  'FeelsOkayMan',
  'monkaS',
];
const SMP_LOW_TIER_EMOTES = [
  '4HEad',
  'pepegaGamble',
  'ForsenLookingAtYou',
  'DonkDink',
  'Bald1G',
  'OnionWTF',
  'elisComfy',
  'PoroSad',
  'DansGame',
];
const SMP_EMOTES = [
  ...SMP_HIGH_TIER_EMOTES,
  ...SMP_MID_TIER_EMOTES,
  ...SMP_LOW_TIER_EMOTES,
];

CHAT_HANDLERS.set('smp', async (bot, username, msg) => {
  if (!await bot.db.moduleIsEnabled('smp')) {
    bot.sendChatMsg('smp module is disabled. To enable, use $module smp on');
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to do a slot machine pull with Sadeg`);
    return;
  }

  const gambledAmountMsg = msg.split(' ')[0].toLowerCase();
  let /** @type {number} */ gambledPoints;
  if (gambledAmountMsg === 'all') {
    gambledPoints = currentPoints;
  } else if (gambledAmountMsg.endsWith('%')) {
    const percent = parseInt(gambledAmountMsg, 10);
    if (isNaN(percent)) {
      bot.sendChatMsg('Failed to parse smp percent. Example: $smp 10%');
      return;
    }
    gambledPoints = Math.floor((percent / 100) * currentPoints);
  } else {
    gambledPoints = parseInt(gambledAmountMsg, 10);
  }
  if (isNaN(gambledPoints)) {
    bot.sendChatMsg('Failed to parse smp amount. Example: $smp 5');
    return;
  }

  if (gambledPoints > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't smp more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (gambledPoints < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  const slot1 = SMP_EMOTES[randomInt(SMP_EMOTES.length)];
  const slot2 = SMP_EMOTES[randomInt(SMP_EMOTES.length)];
  const slot3 = SMP_EMOTES[randomInt(SMP_EMOTES.length)];

  const multiplier = (() => {
    // All three slots match
    if (slot1 === slot2 && slot2 === slot3) {
      if (SMP_HIGH_TIER_EMOTES.includes(slot1)) {
        return 50;
      } else if (SMP_MID_TIER_EMOTES.includes(slot1)) {
        return 35;
      }
      return 25;
    }

    // Slot 1 and 3 match OR Slot 1 and 2 match
    if (slot1 === slot3 || slot1 === slot2) {
      if (SMP_HIGH_TIER_EMOTES.includes(slot1)) {
        return 20;
      } else if (SMP_MID_TIER_EMOTES.includes(slot1)) {
        return 5;
      }
      return 2;
    }

    // Only slot 2 and 3 match
    if (slot2 === slot3) {
      if (SMP_HIGH_TIER_EMOTES.includes(slot2)) {
        return 20;
      } else if (SMP_MID_TIER_EMOTES.includes(slot2)) {
        return 5;
      }
      return 2;
    }

    // No matches
    return 0;
  })();

  const outcome = (gambledPoints * multiplier) || -gambledPoints;

  await bot.db.updateUserPoints(username, outcome);

  const board = `| ${slot1} | ${slot2} | ${slot3} |`;
  if (outcome > 0) {
    bot.sendChatMsg(`${board} ${username} won ${outcome} points in smp EZ Clap`);
  } else {
    bot.sendChatMsg(`${board} ${username} lost ${gambledPoints} points in smp OMEGALUL`);
  }
});

CHAT_HANDLERS.set('settime', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'T'))) {
    bot.sendChatMsg(`${username} does not have permission to settime. FeelsWeirdMan`);
    return;
  }

  const parsedTime = msg.match(/(\+|\-)?(\d*)/);
  const plusMinus = parsedTime[1];
  let time = parseInt(parsedTime[2]);

  if (isNaN(time)) {
    return bot.sendPm(username, 'Time given is not a number');
  } else if (!bot.sendAssignLeader(bot.username)) {
    return infoLog.log('!~~~! Cannot set leader: Insufficient rank');
  }

  if (plusMinus) {
    if (plusMinus === '+') {
      time = bot.leaderData.currentTime + time;
    }

    if (plusMinus === '-') {
      time = bot.leaderData.currentTime - time;
    }
  }

  const setFun = (callback) => {
    bot.sendMediaUpdate(time, false);
    bot.sendAssignLeader('');
    callback();
  };

  const settimeObject = {
    settime: true,
    fun: setFun,
  };

  bot.waitingFunctions.push(settimeObject);
});

CHAT_HANDLERS.set('shuffle', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'U'))) {
    bot.sendChatMsg(`${username} does not have permission to shuffle. FeelsWeirdMan`);
    return;
  }

  bot.shufflePlaylist();
});

CHAT_HANDLERS.set('skip', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'S'))) {
    bot.sendChatMsg(`${username} does not have permission to skip. FeelsWeirdMan`);
    return;
  }

  bot.deleteVideo(bot.currentUID);
});

CHAT_HANDLERS.set('spam', async (bot, username, msg) => {
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

// Shows basic database stats.
CHAT_HANDLERS.set('stats', async (bot, username, msg) => {
  const stats = await bot.db.getGeneralStats();
  if (stats) {
    bot.sendChatMsg(
        `Videos: ${stats.videoCount}, ` +
        `Users: ${stats.userCount}, ` +
        `Chats: ${stats.chatCount}`);
  }

  if (bot.enableWebServer) {
    bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/`);
  }
});

CHAT_HANDLERS.set('status', (bot, username, msg) => {
  if ((new Date().getTime() - bot.timeSinceLastStatus) / 1000 < 120) {
    return bot.sendPm(username, 'Status cooldown');
  }

  bot.timeSinceLastStatus = new Date().getTime();

  bot.sendChatMsg(
      `[Muted: ${bot.stats.muted}; ` +
      `Managing playlist: ${bot.stats.managing}; ` +
      `Userlimit: ${bot.stats.userLimit}; ` +
      `Userlimit Number: ${bot.stats.userLimitNum}]`);
});

CHAT_HANDLERS.set('tempban', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} does not have permission to tempban. FeelsWeirdMan`);
    return;
  }

  const words = msg.split(' ');
  const targetUser = words[0];

  const lengthSecs = parseDuration(words.slice(1).join(' '), /** format= */ 'sec');
  if (isNaN(lengthSecs) || lengthSecs < 0) {
    bot.sendChatMsg('Failed to parse tempban length. Example: $tempban IP0G 10m');
    return;
  }

  const lengthDesc = humanizeDuration(lengthSecs * 1000);
  bot.sendChatMsg(`Temp banning ${targetUser} for ${lengthDesc} MODS`);

  bot.sendChatMsg(`/kick ${targetUser}`, true);

  const end = getCurrentUnixTimestamp() + lengthSecs;
  await bot.db.setUserTempBan(targetUser, end);
});

CHAT_HANDLERS.set('tempbans', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} does not have permission to tempbans. FeelsWeirdMan`);
    return;
  }

  const tempbans = await bot.db.getAllTempBans();

  if (tempbans.length === 0) {
    bot.sendChatMsg('No users currently tempbanned.');
    return;
  }

  bot.sendChatMsg('Current tempbans:');
  for (const tempban of tempbans) {
    const remainingMs = (tempban.end - getCurrentUnixTimestamp()) * 1000;
    bot.sendChatMsg(`${tempban.name} has ${humanizeDuration(remainingMs)} left`);
  }
});

CHAT_HANDLERS.set('timeout', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to timeout. FeelsWeirdMan`);
    return;
  }

  const words = msg.split(' ');
  const targetUser = words[0];

  const lengthSecs = parseDuration(words.slice(1).join(' '), /** format= */ 'sec');
  if (isNaN(lengthSecs) || lengthSecs < 0) {
    bot.sendChatMsg('Failed to parse timeout length. Example: $timeout IP0G 10m');
    return;
  }

  const lengthDesc = humanizeDuration(lengthSecs * 1000);
  bot.sendChatMsg(`Timing out ${targetUser} for ${lengthDesc} MODS`);

  bot.sendChatMsg(`/mute ${targetUser}`, true);

  const end = getCurrentUnixTimestamp() + lengthSecs;
  await bot.db.setUserTimeout(targetUser, end);
});

CHAT_HANDLERS.set('timeouts', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to timeouts. FeelsWeirdMan`);
    return;
  }

  const timeouts = await bot.db.getAllTimeouts();

  if (timeouts.length === 0) {
    bot.sendChatMsg('No users currently timed out.');
    return;
  }

  bot.sendChatMsg('Current timeouts:');
  for (const timeout of timeouts) {
    const remainingMs = (timeout.end - getCurrentUnixTimestamp()) * 1000;
    bot.sendChatMsg(`${timeout.name} has ${humanizeDuration(remainingMs)} left`);
  }
});

CHAT_HANDLERS.set('title', async (bot, username, msg) => {
  const channelName = msg.split(' ')[0];
  if (!channelName) {
    bot.sendChatMsg('Channel name must be provided, ex: $title xqcow');
    return;
  }

  const user = await bot.twitch.getUser(channelName);
  if (!user) {
    bot.sendChatMsg(`Couldn't find user ${channelName}`);
    return;
  }

  const channel = await bot.twitch.getChannel(user.id);
  if (!channel) {
    bot.sendChatMsg(`Couldn't find channel ${channelName}`);
    return;
  }

  bot.sendChatMsg(channel.title);
});

CHAT_HANDLERS.set('translate', async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  const langMatches = msg.split(' ')[0].match(/(\w{2})(?:\-?\>)?(\w{2})?/i);
  if (!langMatches) {
    bot.sendChatMsg(`Couldn't parse languages. Ex: $translate en->es mountain`);
    return;
  }

  const from = langMatches[2] ? langMatches[1] : undefined;
  const to = langMatches[2] || langMatches[1];
  const text = msg.split(' ').slice(1).join(' ');

  try {
    const response = await translate(text, {from, to});
    bot.sendChatMsg(`[${response.from.language.iso}->${to}] ${response.text}`);
  } catch (err) {
    errorLog.log(err);
    bot.sendChatMsg('Google Translate API call failed');
  }
});

CHAT_HANDLERS.set('unban', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'N'))) {
    bot.sendChatMsg(`${username} does not have permission to unban. FeelsWeirdMan`);
    return;
  }

  const targetUser = msg.split(' ')[0];

  // Create an object that will be used to execute the unban when we get the
  // banlist.
  const unbanRequest = {
    unban: true,
    fun: (callback) => {
      const bans = bot.banlist.filter((ban) => ban.name.toLowerCase() === targetUser.toLowerCase());
      if (bans.length === 0) {
        bot.sendChatMsg(`${targetUser} doesn't appear to be banned monkaHmm`);
        callback();
        return;
      }
      for (const ban of bans) {
        bot.sendUnban({
          id: ban.id,
          name: ban.name,
        });
      }
      callback();
    },
  };

  // Add to the waitlist.
  bot.waitingFunctions.push(unbanRequest);
  bot.socket.emit('requestBanlist');

  await bot.db.setUserTempBan(targetUser, 0);
  bot.sendChatMsg(`${targetUser} has been unbanned and may join again. FeelsOkayMan`);
});

CHAT_HANDLERS.set('unmute', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(`${username} does not have permission to unmute. FeelsWeirdMan`);
    return;
  }

  if (bot.stats.muted) {
    bot.stats.muted = !bot.stats.muted;
    auditLog.log(`!~~~! ${username} unmuted bot`);
    bot.writePersistentSettings();
  }
});

CHAT_HANDLERS.set('update', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.FOUNDER, 'K'))) {
    bot.sendChatMsg(`${username} does not have permission to update. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('Updating...');

  let /** @type {string} */ stdout;
  try {
    const result = await execAsync('npm install');
    if (result.stderr) {
      errorLog.log(`error running npm install: ${result.stderr}`);
      bot.sendChatMsg('Update failed, please check logs.');
      return;
    }
    stdout = result.stdout;
  } catch (e) {
    errorLog.log(`error running npm install: ${e}`);
    bot.sendChatMsg('Update failed, please check logs.');
    return;
  }

  infoLog.log(`Results of running npm install: ${stdout}`);

  try {
    const result = await execAsync('git pull');
    if (result.stderr) {
      errorLog.log(`error running git pull: ${result.stderr}`);
      bot.sendChatMsg('Update failed, please check logs.');
      return;
    }
    stdout = result.stdout;
  } catch (e) {
    errorLog.log(`error running git pull: ${e}`);
    bot.sendChatMsg('Update failed, please check logs.');
    return;
  }

  infoLog.log(`Results of running git pull: ${stdout}`);

  if (stdout === 'Already up to date.\n') {
    bot.sendChatMsg('Already up-to-date. FeelsOkayMan :+1:');
    return;
  }

  bot.sendChatMsg('Restarting, please wait...');
  kill(/* afterMs= */ 2000);
});

CHAT_HANDLERS.set('userlimit', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'L'))) {
    bot.sendChatMsg(`${username} does not have permission to userlimit. FeelsWeirdMan`);
    return;
  }

  const match = msg.match(/^(true|false) ?(\d*)|(\d*)/);

  parseUserlimit(bot, match);
  bot.checkPlaylist();
  bot.writePersistentSettings();
});

CHAT_HANDLERS.set('userstats', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;
  const chatCount = await bot.db.getUserStats(target);
  const quote = filterMsg((await bot.db.getQuote(target)).msg);
  bot.sendChatMsg(`${target} has sent ${chatCount} messages, random quote: ${quote}`);
});

CHAT_HANDLERS.set('weather', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!bot.openWeatherApiKey) {
    return bot.sendChatMsg('OpenWeather API not configured FeelsBaddestMan');
  }

  if (!bot.weatherLimiter.tryRemoveTokens(1)) {
    bot.sendChatMsg('Out of weather API quota, try again later.');
    return;
  }

  const location = msg.trim();

  let data;
  try {
    let /** @type {AsyncWeather} */ weather;
    if (/^\d+$/.test(location)) {
      // Contains only digits. Probably a zip code.
      weather = await weatherFromZipCode(location, bot.openWeatherApiKey);
    } else {
      // Assume they've provided city
      weather = await weatherFromLocation(location, bot.openWeatherApiKey);
    }
    data = await weather.getAllWeather();
  } catch (err) {
    errorLog.log(err);
    bot.sendChatMsg(
        'Weather API call failed. If you typed a location, try the format "city,county,country"');
    return;
  }

  const temp = Math.floor(data.main.temp);
  const title = data.weather[0].main;
  const city = data.name;
  const country = data.sys.country;

  bot.sendChatMsg(`[${city}, ${country}]: ${temp}°${WEATHER_ABBREVIATION}, ${title}`);
});

CHAT_HANDLERS.set('wolfram', async (bot, username, msg) => {
  if (!bot.wolframApiKey) {
    bot.sendChatMsg('No Wolfram API key in config!');
    return;
  }

  if (bot.wolframLimiter.getTokensRemaining() < 1) {
    bot.sendChatMsg('Wolfram query allowance used up for the day');
    return;
  }

  if (!msg) {
    bot.sendChatMsg('Query must be provided, ex: $wolfram distance to the moon');
    return;
  }

  let /** @type {string} */ response;
  try {
    response = await callWolfram(msg, bot.wolframApiKey);
    bot.sendChatMsg(response);
  } catch (e) {
    errorLog.log(`Wolfram call failed: ${e}`);
    bot.sendChatMsg(e);
  }
});

CHAT_HANDLERS.set('#showemote', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!bot.showemoteLimiter.tryRemoveTokens(1)) {
    return bot.sendPm(username, '$#showemote is on cooldown');
  }
  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints < 100) {
    bot.sendChatMsg(`${username}: you don't have enough points for $#showemote`);
    return;
  }
  const emote = msg.split(' ')[0];
  const emoteNames = bot.channelEmotes.map((emote) => emote.name);
  const uPoints = -100;
  if (emoteNames.includes(emote)) {
    await bot.db.updateUserPoints(username, uPoints);
    bot.sendChatMsg(`!#showing emote ${emote}`);
  } else {
    bot.sendChatMsg(`${emote} is not an emote`);
  }
});

/**
 * Handle a chat message.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} msg The message being handled, including the command.
 * @return {?} The return value of the chat message's handler, or null.
 */
export function handle(bot, username, msg) {
  const commands = msg.split(' ');
  const command = commands.splice(0, 1)[0].substring(1);
  const msgWithoutCommand = commands.join(' ');

  if (CHAT_HANDLERS.has(command)) {
    const handler = CHAT_HANDLERS.get(command);
    return handler(bot, username, msgWithoutCommand);
  }

  return customHandle(bot, username, command, msgWithoutCommand);
}
