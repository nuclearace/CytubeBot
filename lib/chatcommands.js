import {exec} from 'child_process';
import {randomInt} from 'crypto';
import humanizeDuration from 'humanize-duration';
import {promisify} from 'util';

import {callAnagram, callForecast, callGoogleTranslate, callWeather, callWolfram} from './apiclient.js';
import {handle as customHandle} from './custom.js';
import {Rank} from './cytubebot.js';
import {cytubelog, errlog, syslog} from './logger.js';
import {sendHybridModPermissions} from './permissions.js';
import {genericUIDLoop, getCurrentUnixTimestamp, getUser, kill, parseBumpData, parseDeleteData, parseForecastData, parseMediaLink, parseUserlimit, sleep} from './utils.js';
import {validateYouTubeVideo} from './validate.js';

const execAsync = promisify(exec);

/** @typedef {import('./cytubebot.js').CytubeBot} CytubeBot */

/**
 * @callback Handler
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} msg The message to handle, not including the command.
 * @param {boolean} fromIrc Whether or not the message came from IRC.
 */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
const CHAT_HANDLERS = new Map();

CHAT_HANDLERS.set('add', async (bot, username, msg, fromIrc) => {
  if (fromIrc || !msg) {
    return;
  }

  if (!(await bot.checkPermission(username, Rank.MOD, 'A'))) {
    bot.sendChatMsg(
        `${username} does not have permission to add. FeelsWeirdMan`);
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
  if (vid.type === 'yt' && bot.youtubeapi) {
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

CHAT_HANDLERS.set('addrandom', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'R'))) {
    bot.sendChatMsg(
        `${username} does not have permission to addrandom. FeelsWeirdMan`);
    return;
  }
  if (msg > 20) {
    return;
  }

  bot.addRandomVideos(msg);
});

CHAT_HANDLERS.set('allow', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
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
    bot.sendChatMsg(
        `${username} does not have permission to allow. FeelsWeirdMan`);
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

CHAT_HANDLERS.set('anagram', (bot, username, msg, fromIrc) => {
  if ((new Date().getTime() - bot.timeSinceLastAnagram) / 1000 < 5) {
    return bot.sendPM(username, 'Anagram cooldown');
  }

  bot.timeSinceLastAnagram = new Date().getTime();
  if (msg.length < 7) {
    return bot.sendChatMsg('Message too short');
  } else if (msg.length > 30) {
    return bot.sendChatMsg('Message too long');
  }

  callAnagram(msg, (resp) => {
    try {
      bot.sendChatMsg(`[${msg}] -> ${resp[1]}`);
    } catch (e) {
      bot.sendPM(username, 'There was a problem with the request');
    }
  });
});

CHAT_HANDLERS.set('ask', (bot, username, msg, fromIrc) => {
  const answers = ['Yes', 'No'];
  const answer = answers[Math.floor(Math.random() * 2)];
  bot.sendChatMsg(`[Ask: ${msg}] ${answer}`);
});

CHAT_HANDLERS.set('autodelete', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to autodelete. FeelsWeirdMan`);
    return;
  }

  bot.blockVideo();
});

CHAT_HANDLERS.set('ban', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'N'))) {
    bot.sendChatMsg(
        `${username} does not have permission to ban. FeelsWeirdMan`);
    return;
  }

  if (username.toLowerCase() === msg.split(' ')[0].toLowerCase()) {
    return;
  }

  bot.sendChatMsg(`/ban ${msg}`, true);
});

CHAT_HANDLERS.set('blacklist', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to blacklist. FeelsWeirdMan`);
    return;
  }

  bot.blacklistVideo();
  bot.sendChatMsg('Blacklisted current video.');
});

CHAT_HANDLERS.set('blacklistedusers', (bot, username, msg, fromIrc) => {
  bot.listBlacklistedUsers();
});

CHAT_HANDLERS.set('blacklistuser', async (bot, username, msg, fromIrc) => {
  if (typeof msg === 'undefined' || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.ADMIN, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to blacklist. FeelsWeirdMan`);
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

CHAT_HANDLERS.set('blockedusers', (bot, username, msg, fromIrc) => {
  bot.listBlockedUsers();
});

CHAT_HANDLERS.set('blockuser', async (bot, username, msg, fromIrc) => {
  if (fromIrc || !msg) {
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

CHAT_HANDLERS.set('bump', async (bot, username, msg, fromIrc) => {
  if (fromIrc || !msg) {
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

CHAT_HANDLERS.set(
    'cleandatabasevideos', async (bot, username, msg, fromIrc) => {
      if (!(await bot.checkPermission(username, Rank.FOUNDER, null))) {
        bot.sendChatMsg(
            `${username} does not have permission to cleandatabasevideos. ` +
            `FeelsWeirdMan`);
        return;
      }

      bot.cleanDatabaseVideos();
    });

CHAT_HANDLERS.set('choose', (bot, username, msg, fromIrc) => {
  if (!msg) {
    return;
  }

  const choices = msg.trim().split(' ');
  const choice = choices[Math.floor(Math.random() * choices.length)];
  bot.sendChatMsg(`[Choose: ${choices.join(' ')} ] ${choice}`);
});

CHAT_HANDLERS.set('clearchat', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(
        `${username} does not have permission to clearchat. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('/clear', true);
});

CHAT_HANDLERS.set('currenttime', (bot, username, msg, fromIrc) => {
  const currentTime = Math.round(bot.leaderData.currentTime);
  bot.sendChatMsg(`Current Time: ${currentTime}`);
});

// Unlisted command.
CHAT_HANDLERS.set('debuguserlist', (bot, username, msg, fromIrc) => {
  if (msg) {
    const user = getUser(bot, msg.trim());
    return console.log(user);
  }
  console.log(bot.userlist);
});

CHAT_HANDLERS.set('delete', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'D'))) {
    bot.sendChatMsg(
        `${username} does not have permission to delete. FeelsWeirdMan`);
    return;
  }

  msg = {
    userData: msg,
    username: username,
  };

  const deleteData = parseDeleteData(bot, msg);
  if (username.toLowerCase() === deleteData.name.toLowerCase()) {
    genericUIDLoop(bot, deleteData);
  } else if (hasPermission) {
    genericUIDLoop(bot, deleteData);
  }
});

CHAT_HANDLERS.set('deletevideos', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.FOUNDER, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to deletevideos. FeelsWeirdMan`);
    return;
  }

  bot.deleteVideosFromDatabase(msg);
});

CHAT_HANDLERS.set('disallow', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(
        `${username} does not have permission to disallow. FeelsWeirdMan`);
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

CHAT_HANDLERS.set('duplicates', async (bot, username, msg, fromIrc) => {
  if (fromIrc || bot.playlist.length === 0) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'D'))) {
    bot.sendChatMsg(
        `${username} does not have permission to duplicates. FeelsWeirdMan`);
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

CHAT_HANDLERS.set('emotes', (bot, username, msg, fromIrc) => {
  if (!bot.enableWebServer) {
    return bot.sendChatMsg('WebServer not enabled');
  }

  bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/emotes`);
});

CHAT_HANDLERS.set('forecast', async (bot, username, msg, fromIrc) => {
  if (bot.muted || !bot.weatherunderground || !msg) {
    return;
  }

  const now = Date.now();
  const waitTime = ((bot.weatherLimiter.curIntervalStart +
                     bot.weatherLimiter.tokenBucket.interval) -
                    now) /
      1000;

  if (bot.weatherLimiter.getTokensRemaining() < 1) {
    bot.sendChatMsg(
        `Too many requests sent. Available in: ${waitTime} seconds`);
    return;
  }

  const tomorrow = msg.match('tomorrow');
  if (tomorrow) {
    msg = msg.replace(/tomorrow/ig, '');
  }

  await bot.weatherLimiter.removeTokens(1);
  const resp = callForecast(msg, bot.weatherunderground);

  const parsedJSON = JSON.parse(resp);
  if (parsedJSON.response.error || parsedJSON.response.results) {
    return bot.sendChatMsg('Error');
  }

  for (const forecastString of parseForecastData(parsedJSON, tomorrow)) {
    bot.sendChatMsg(forecastString);
  }
});

CHAT_HANDLERS.set('help', (bot, username, msg, fromIrc) => {
  bot.sendChatMsg(
      'https://github.com/airforce270/CytubeBot/blob/master/README.md#commands');
});

CHAT_HANDLERS.set('internals', (bot, username, msg, fromIrc) => {
  if (!bot.enableWebServer) {
    return bot.sendChatMsg('WebServer not enabled');
  }

  bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/internals`);
});

CHAT_HANDLERS.set('ipban', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'N'))) {
    bot.sendChatMsg(
        `${username} does not have permission to ipban. FeelsWeirdMan`);
    return;
  }
  if (username.toLowerCase() === msg.toLowerCase()) {
    return;
  }

  bot.sendChatMsg(`/ipban ${msg}`, true);
});

CHAT_HANDLERS.set('kick', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(
        `${username} does not have permission to kick. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg(`/kick ${msg}`, true);
});

CHAT_HANDLERS.set('listpermissions', (bot, username, msg, fromIrc) => {
  const name = msg || username;
  sendHybridModPermissions(bot, name.toLowerCase());
});

CHAT_HANDLERS.set('management', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'G'))) {
    bot.sendChatMsg(
        `${username} does not have permission to management. FeelsWeirdMan`);
    return;
  }

  if (msg.indexOf('on') !== -1) {
    syslog.log('!~~~! Bot is now managing the playlist');
    bot.stats.managing = true;
    bot.writePersistentSettings();
  } else if (msg.indexOf('off') !== -1) {
    syslog.log('!~~~! The bot is no longer managing the playlist');
    bot.stats.managing = false;
    bot.writePersistentSettings();
  }

  if (bot.playlist.length === 0 && bot.stats.managing) {
    bot.addRandomVideos();
  }
});

CHAT_HANDLERS.set('module', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to module. FeelsWeirdMan`);
    return;
  }

  const module = msg.split(' ')[0];

  const enableMsg = msg.split(' ')[1];
  if (enableMsg !== 'on' && enableMsg !== 'off') {
    bot.sendChatMsg(
        `Failed to determine new module status, should be "on" or "off".`);
    return;
  }
  const enable = enableMsg === 'on';

  bot.db.setModuleEnabled(module, enable);
  bot.sendChatMsg(`${enable ? 'Enabled' : 'Disabled'} module ${module}`);
});

CHAT_HANDLERS.set('modulesoff', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to modulesoff. FeelsWeirdMan`);
    return;
  }

  const modules = await bot.db.getAllModules();
  for (const module of modules) {
    bot.db.setModuleEnabled(module, false);
  }
  bot.sendChatMsg(`Disabled modules: ${modules}`);
});

CHAT_HANDLERS.set('moduleson', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to moduleson. FeelsWeirdMan`);
    return;
  }

  const modules = await bot.db.getAllModules();
  for (const module of modules) {
    bot.db.setModuleEnabled(module, true);
  }
  bot.sendChatMsg(`Enabled modules: ${modules}`);
});

CHAT_HANDLERS.set('mute', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(
        `${username} does not have permission to mute. FeelsWeirdMan`);
    return;
  }

  if (!bot.stats.muted) {
    bot.stats.muted = !bot.stats.muted;
    syslog.log(`!~~~! ${username} muted bot`);
    bot.writePersistentSettings();
  }
});

CHAT_HANDLERS.set('unmute', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(
        `${username} does not have permission to unmute. FeelsWeirdMan`);
    return;
  }

  if (bot.stats.muted) {
    bot.stats.muted = !bot.stats.muted;
    syslog.log(`!~~~! ${username} unmuted bot`);
    bot.writePersistentSettings();
  }
});

CHAT_HANDLERS.set('ping', async (bot, username, msg, fromIrc) => {
  bot.sendChatMsg(`${username}: MrDestructoid Donk`);
});

CHAT_HANDLERS.set('rngping', async (bot, username, msg, fromIrc) => {
  const randomIndex = randomInt(bot.userlist.length - 1);
  const randomUser = bot.userlist[randomIndex];
  bot.sendChatMsg(`${randomUser.name}: MrDestructoid Donk`);
});

// eslint-disable-next-line valid-jsdoc
const /** @type {Handler} */ pointsHandler =
    async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }

  const targetUser = msg.trim();
  if (targetUser) {
    const allUsers = await bot.db.getAllUsers();
    if (!allUsers.includes(targetUser)) {
      bot.sendChatMsg(`User ${targetUser} not found modCheck`);
      return;
    }
  }

  const user = targetUser || username;
  const points = await bot.db.getUserPoints(user);
  bot.sendChatMsg(`${user} has ${points} points`);
};

CHAT_HANDLERS.set('p', pointsHandler);
CHAT_HANDLERS.set('points', pointsHandler);
CHAT_HANDLERS.set('userpoints', pointsHandler);

CHAT_HANDLERS.set('givepoints', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }

  const targetUser = msg.split(' ')[0];
  if (targetUser) {
    const allUsers = await bot.db.getAllUsers();
    if (!allUsers.includes(targetUser)) {
      bot.sendChatMsg(`User ${targetUser} not found modCheck`);
      return;
    }
  }

  const currentPoints = await bot.db.getUserPoints(username);

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg(
        'Points amount must be provided. ' +
        'Example: $givepoints airforce2700 100');
    return;
  }
  const givingAmountMsg = msg.split(' ')[1].toLowerCase();
  const givingAmount =
      givingAmountMsg === 'all' ? currentPoints : parseInt(givingAmountMsg, 10);
  if (isNaN(givingAmount)) {
    bot.sendChatMsg(
        'Failed to parse points amount. Example: $givepoints airforce2700 100');
    return;
  }
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to give Sadeg`);
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

  bot.sendChatMsg(
      `${username} gave ${givingAmount} points to ${targetUser} FeelsOkayMan`);
});

CHAT_HANDLERS.set('addpoints', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to addpoints. FeelsWeirdMan`);
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

CHAT_HANDLERS.set('removepoints', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to removepoints. FeelsWeirdMan`);
    return;
  }

  const user = msg.split(' ')[0];
  if (!isNaN(parseInt(user, 10))) {
    bot.sendChatMsg(
        'Username must be provided for removepoints. ' +
        'Example: $removepoints IP0G 100000 :tf:');
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg(
        'Points amount must be provided. ' +
        'Example: $removepoints IP0G 100');
    return;
  }

  const deltaMsg = msg.split(' ')[1].toLowerCase();
  const delta = deltaMsg === 'all' ? Number.MAX_VALUE : parseInt(deltaMsg, 10);

  await bot.db.updateUserPoints(user, -delta);

  const newPoints = await bot.db.getUserPoints(user);
  bot.sendChatMsg(`${user} now has ${newPoints} points`);
});

CHAT_HANDLERS.set('permissions', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.ADMIN, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to permissions. FeelsWeirdMan`);
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

// Unlisted command.
CHAT_HANDLERS.set('playlistdebug', (bot, username, msg, fromIrc) => {
  if (msg) {
    return console.log(bot.playlist[msg]);
  }

  console.log(bot.playlist);
});

CHAT_HANDLERS.set('poll', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'P'))) {
    bot.sendChatMsg(
        `${username} does not have permission to poll. FeelsWeirdMan`);
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

CHAT_HANDLERS.set('endpoll', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'P'))) {
    bot.sendChatMsg(
        `${username} does not have permission to endpoll. FeelsWeirdMan`);
    return;
  }

  bot.endPoll();
});

CHAT_HANDLERS.set('processinfo', (bot) => {
  const info = process.memoryUsage();
  bot.sendChatMsg(`Heap total: ${info.heapTotal} Heap used: ${info.heapUsed}`);
});

CHAT_HANDLERS.set('purge', (bot, username, msg, fromIrc) => {
  if (!msg) {
    msg = username;
  }

  msg = `${msg.trim()} all`;
  CHAT_HANDLERS.get('delete')(bot, username, msg, fromIrc);
});

CHAT_HANDLERS.set('quote', (bot, username, msg, fromIrc) => {
  bot.getQuote(msg);
});

CHAT_HANDLERS.set('randomemote', (bot, username, msg, fromIrc) => {
  const randomIndex = randomInt(bot.channelEmotes.length - 1);
  const randomEmote = bot.channelEmotes[randomIndex];
  bot.sendChatMsg(randomEmote.name);
});

CHAT_HANDLERS.set('restart', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'K'))) {
    bot.sendChatMsg(
        `${username} does not have permission to restart. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('Restarting, please wait...');
  kill();
});

CHAT_HANDLERS.set('rngban', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if ((await bot.db.getUserRank(username)) >= Rank.MOD) {
    bot.sendChatMsg('Only non-mods can rngban FeelsOkayMan');
    return;
  }

  bot.sendChatMsg(`/kick ${username}`, true);
  bot.sendPM(username, 'https://bit.ly/cydj-rngban-appeal');
  bot.sendChatMsg(':tf:');
  await sleep(5 * 1000);
  bot.sendPM(username, ':tf:');
});

CHAT_HANDLERS.set('rngkick', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(
        `${username} does not have permission to rngkick. FeelsWeirdMan`);
    return;
  }

  const kickableUsers =
      bot.userlist.filter((user) => user.name !== bot.username)
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

CHAT_HANDLERS.set('roulette', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.db.moduleIsEnabled('roulette'))) {
    bot.sendChatMsg(
        'Roulette module is disabled. To enable, use $module roulette on');
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);

  const gambledAmountMsg = msg.split(' ')[0].toLowerCase();
  let /** @type {number} */ gambledPoints;
  if (gambledAmountMsg === 'all') {
    gambledPoints = currentPoints;
  } else if (gambledAmountMsg.endsWith('%')) {
    const percent = parseInt(gambledAmountMsg, 10);
    if (isNaN(percent)) {
      bot.sendChatMsg(
          'Failed to parse roulette percent. Example: $roulette 10%');
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
  if (currentPoints === 0) {
    bot.sendChatMsg(
        `${username}: you don't have any points to roulette with Sadeg`);
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

CHAT_HANDLERS.set('settime', async (bot, username, msg, fromIrc) => {
  if (fromIrc || !msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'T'))) {
    bot.sendChatMsg(
        `${username} does not have permission to settime. FeelsWeirdMan`);
    return;
  }

  const parsedTime = msg.match(/(\+|\-)?(\d*)/);
  const plusMinus = parsedTime[1];
  let time = parseInt(parsedTime[2]);

  if (isNaN(time)) {
    return bot.sendPM(username, 'Time given is not a number');
  } else if (!bot.sendAssignLeader(bot.username)) {
    return cytubelog.log('!~~~! Cannot set leader: Insufficient rank');
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

CHAT_HANDLERS.set('shuffle', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'U'))) {
    bot.sendChatMsg(
        `${username} does not have permission to shuffle. FeelsWeirdMan`);
    return;
  }

  bot.shufflePlaylist();
});

CHAT_HANDLERS.set('skip', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'S'))) {
    bot.sendChatMsg(
        `${username} does not have permission to skip. FeelsWeirdMan`);
    return;
  }

  bot.deleteVideo(bot.currentUID);
});

// Shows basic database stats.
CHAT_HANDLERS.set('stats', (bot) => {
  bot.getGeneralStats();
  if (bot.enableWebServer) {
    bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/`);
  }
});

CHAT_HANDLERS.set('status', (bot, username, msg, fromIrc) => {
  if ((new Date().getTime() - bot.timeSinceLastStatus) / 1000 < 120) {
    return bot.sendPM(username, 'Status cooldown');
  }

  bot.timeSinceLastStatus = new Date().getTime();
  bot.sendStatus();
});

CHAT_HANDLERS.set('talk', (bot, username, msg, fromIrc) => {
  if ((new Date().getTime() - bot.timeSinceLastTalk) / 1000 < 5) {
    return bot.sendPM(username, 'Talk cooldown');
  }

  bot.timeSinceLastTalk = new Date().getTime();
  bot.talk(msg, (resp) => bot.sendChatMsg(resp));
});

CHAT_HANDLERS.set('tempban', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(
        `${username} does not have permission to tempban. FeelsWeirdMan`);
    return;
  }

  const targetUser = msg.split(' ')[0];

  const lengthMins = parseInt(msg.split(' ')[1], 10);
  if (isNaN(lengthMins) || lengthMins < 0) {
    bot.sendChatMsg(
        'Failed to parse temp ban length. Example: $tempban IP0G 5');
    return;
  }

  const lengthSecs = lengthMins * 60;
  const lengthDesc = humanizeDuration(lengthSecs * 1000);
  bot.sendChatMsg(`Temp banning ${targetUser} for ${lengthDesc} MODS`);

  bot.sendChatMsg(`/kick ${targetUser}`, true);

  const end = getCurrentUnixTimestamp() + lengthSecs;
  await bot.db.setUserSuspension(targetUser, end);
});

CHAT_HANDLERS.set('translate', (bot, username, msg, fromIrc) => {
  if (!msg) {
    return;
  }

  if ((new Date().getTime() - bot.timeSinceLastTranslate) / 1000 < 5) {
    return bot.sendChatMsg('Translate cooldown');
  }

  bot.timeSinceLastTranslate = new Date().getTime();
  const groups =
      msg.match(/^(\[(([A-z]{2})|([A-z]{2}) ?-?> ?([A-z]{2}))\] ?)?(.+)$/);

  let from = groups[4];
  let to = groups[5];
  const text = groups[6];
  if (!from) {
    from = 'auto';
    to = 'en';
  }
  const query = {
    text: text,
    trans: {
      from: from,
      to: to,
    },
  };
  callGoogleTranslate(query, (err, res) => {
    if (err) {
      return bot.sendChatMsg(err);
    }
    bot.sendChatMsg(`[${res.from.language.iso}->${to}] ${res.text}`);
  });
});

CHAT_HANDLERS.set('unban', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'N'))) {
    bot.sendChatMsg(
        `${username} does not have permission to unban. FeelsWeirdMan`);
    return;
  }

  const targetUser = msg.split(' ')[0];

  // Create an object that will be used to execute the unban when we get the
  // banlist.
  const unbanRequest = {
    unban: true,
    fun: (callback) => {
      const bans = bot.banlist.filter(
          (ban) => ban.name.toLowerCase() === targetUser.toLowerCase());
      if (bans.length === 0) {
        bot.sendChatMsg(`${targetUser} doesn't appear to be banned monkaHmm`);
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

  await bot.db.setUserSuspension(targetUser, 0);
  bot.sendChatMsg(
      `${targetUser} has been unbanned and may join again. FeelsOkayMan`);
});

CHAT_HANDLERS.set('update', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }

  if (!(await bot.checkPermission(username, Rank.FOUNDER, 'K'))) {
    bot.sendChatMsg(
        `${username} does not have permission to update. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('Updating...');

  let /** @type {string} */ stdout;
  try {
    const result = await execAsync('npm install');
    if (result.stderr) {
      errlog.log(`error running npm install: ${result.stderr}`);
      bot.sendChatMsg('Update failed, please check logs.');
      return;
    }
    stdout = result.stdout;
  } catch (e) {
    errlog.log(`error running npm install: ${e}`);
    bot.sendChatMsg('Update failed, please check logs.');
    return;
  }

  cytubelog.log(`Results of running npm install: ${stdout}`);

  try {
    const result = await execAsync('git pull');
    if (result.stderr) {
      errlog.log(`error running git pull: ${result.stderr}`);
      bot.sendChatMsg('Update failed, please check logs.');
      return;
    }
    stdout = result.stdout;
  } catch (e) {
    errlog.log(`error running git pull: ${e}`);
    bot.sendChatMsg('Update failed, please check logs.');
    return;
  }

  cytubelog.log(`Results of running git pull: ${stdout}`);

  if (stdout === 'Already up to date.\n') {
    bot.sendChatMsg('Already up-to-date. FeelsOkayMan :+1:');
    return;
  }

  bot.sendChatMsg('Restarting, please wait...');
  kill(/* afterMs= */ 2000);
});

CHAT_HANDLERS.set('userlimit', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'L'))) {
    bot.sendChatMsg(
        `${username} does not have permission to userlimit. FeelsWeirdMan`);
    return;
  }

  const match = msg.match(/^(true|false) ?(\d*)|(\d*)/);

  parseUserlimit(bot, match);
  bot.checkPlaylist();
  bot.writePersistentSettings();
});

CHAT_HANDLERS.set('weather', async (bot, username, msg, fromIrc) => {
  if (!bot.weatherunderground) {
    return bot.sendChatMsg('No weatherunderground API key!');
  } else if (!msg || bot.muted) {
    return;
  }

  const now = Date.now();
  const waitTime = ((bot.weatherLimiter.curIntervalStart +
                     bot.weatherLimiter.tokenBucket.interval) -
                    now) /
      1000;

  if (bot.weatherLimiter.getTokensRemaining() < 1) {
    bot.sendChatMsg(
        `Too many requests sent. Available in: ${waitTime} seconds`);
    return;
  }

  const postAPI = (resp) => {
    const parsedJSON = JSON.parse(resp);
    if (parsedJSON.response.error || parsedJSON.response.results) {
      return bot.sendChatMsg('Error');
    }

    const location = parsedJSON.current_observation.display_location.full;
    const tempF = parsedJSON.current_observation.temp_f;
    const tempC = parsedJSON.current_observation.temp_c;
    const date = parsedJSON.current_observation.observation_time;
    const weather = parsedJSON.current_observation.weather;

    bot.sendChatMsg(
        `Currently ${weather} and ${tempF}F (${tempC}C) ` +
        `in ${location}. ${date}`);
  };

  await bot.weatherLimiter.removeTokens(1);
  callWeather(msg, bot.weatherunderground, postAPI);
});

CHAT_HANDLERS.set('wolfram', (bot, username, msg, fromIrc) => {
  if (!bot.wolfram) {
    return bot.sendChatMsg('No wolfram API key!');
  }

  if (bot.wolframLimiter.getTokensRemaining() < 1) {
    return bot.sendChatMsg('Wolfram allowance used up for the day');
  }

  callWolfram(msg, bot.wolfram, (result) => bot.sendChatMsg(result));
});

/**
 * Handle a chat message.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username Username of the user that sent the message.
 * @param {string} msg The message being handled, including the command.
 * @param {boolean} fromIrc Whether or not the message came from IRC.
 * @return {?} The return value of the chat message's handler, or null.
 */
export function handle(bot, username, msg, fromIrc) {
  const commands = msg.split(' ');
  const command = commands.splice(0, 1)[0].substring(1);
  const msgWithoutCommand = commands.join(' ');

  if (CHAT_HANDLERS.has(command)) {
    const handler = CHAT_HANDLERS.get(command);
    return handler(bot, username, msgWithoutCommand, fromIrc);
  }

  return customHandle(bot, username, command, msgWithoutCommand, fromIrc);
}
