import {exec} from 'child_process';
import {randomInt} from 'crypto';
import {writeFile} from 'fs/promises';
import humanizeDuration from 'humanize-duration';
import parseDuration from 'parse-duration';
import {promisify} from 'util';

import {callAnagram, callForecast, callGoogleTranslate, callWeather, callWolfram} from './apiclient.js';
import {Rank, RESTART_TIMES_FILE_NAME} from './constants.js';
import {handle as customHandle} from './custom.js';
import {auditLog, errorLog, infoLog, monitorErrorLog} from './logger.js';
import {sendHybridModPermissions} from './permissions.js';
import {filterMsg, genericUIDLoop, getCurrentUnixTimestamp, getUser, kill, parseBumpData, parseDeleteData, parseForecastData, parseMediaLink, parseUserlimit, sendMessagesWithRateLimit, sendPmsWithRateLimit, sleep} from './utils.js';
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
  if (msg > 20) {
    return;
  }

  bot.addRandomVideos(msg);
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

CHAT_HANDLERS.set('anagram', (bot, username, msg) => {
  if ((new Date().getTime() - bot.timeSinceLastAnagram) / 1000 < 5) {
    return bot.sendPm(username, 'Anagram cooldown');
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
      bot.sendPm(username, 'There was a problem with the request');
    }
  });
});

CHAT_HANDLERS.set('ask', (bot, username, msg) => {
  const answers = ['Yes', 'No'];
  const answer = answers[Math.floor(Math.random() * 2)];
  bot.sendChatMsg(`[Ask: ${msg}] ${answer}`);
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

CHAT_HANDLERS.set('currenttime', (bot, username, msg) => {
  const currentTime = Math.round(bot.leaderData.currentTime);
  bot.sendChatMsg(`Current Time: ${currentTime}`);
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

CHAT_HANDLERS.set('forecast', async (bot, username, msg) => {
  if (bot.muted || !bot.weatherUndergroundApiKey || !msg) {
    return;
  }

  const now = Date.now();
  const waitTime =
      ((bot.weatherLimiter.curIntervalStart + bot.weatherLimiter.tokenBucket.interval) - now) /
      1000;

  if (bot.weatherLimiter.getTokensRemaining() < 1) {
    bot.sendChatMsg(`Too many requests sent. Available in: ${waitTime} seconds`);
    return;
  }

  const tomorrow = msg.match('tomorrow');
  if (tomorrow) {
    msg = msg.replace(/tomorrow/ig, '');
  }

  await bot.weatherLimiter.removeTokens(1);
  const resp = callForecast(msg, bot.weatherUndergroundApiKey);

  const parsedJSON = JSON.parse(resp);
  if (parsedJSON.response.error || parsedJSON.response.results) {
    return bot.sendChatMsg('Error');
  }

  for (const forecastString of parseForecastData(parsedJSON, tomorrow)) {
    bot.sendChatMsg(forecastString);
  }
});

CHAT_HANDLERS.set('givepoints', async (bot, username, msg) => {
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
  const givingAmount = givingAmountMsg === 'all' ? currentPoints : parseInt(givingAmountMsg, 10);
  if (isNaN(givingAmount)) {
    bot.sendChatMsg('Failed to parse points amount. Example: $givepoints airforce2700 100');
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
  if (!bot.raffleInProgress) {
    bot.sendPm(username, 'No raffle in progress');
  }
  bot.usersInRaffle.add(username);
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
        username,
        `Name of log must be one of the following: ${logFiles}. ` +
            `Provided: ${fileName}`);
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


// eslint-disable-next-line valid-jsdoc
const /** @type {Handler} */ pointsHandler = async (bot, username, msg) => {
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

CHAT_HANDLERS.set('raffle', async (bot, username, msg) => {
  if (!(await bot.db.moduleIsEnabled('raffle'))) {
    bot.sendChatMsg('Raffle module is disabled. To enable, use $module raffle on');
    return;
  }

  if (bot.raffleInProgress) {
    bot.sendChatMsg('A raffle is already in progress Pepega');
  }
  if (bot.raffleLimiter.getTokensRemaining() < 1) {
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
  await bot.raffleLimiter.removeTokens(1);
  bot.raffleInProgress = true;

  const raffleTimeSeconds = 30;

  bot.sendChatMsg(
      `${username} has started a raffle for ${points} points. ` +
      `Type $join in the next ${raffleTimeSeconds} seconds to join!`);

  setTimeout(async () => {
    let /** @type {string} */ winner;
    if (bot.usersInRaffle.size === 0) {
      winner = username;
      bot.sendChatMsg('No-one joined the raffle...');
    } else {
      const users = Array.from(bot.usersInRaffle.values());
      winner = users[randomInt(bot.usersInRaffle.size)];
      bot.sendChatMsg(`${winner} won the raffle and receives ${points} points!`);
    }
    await bot.db.updateUserPoints(winner, points);
    bot.raffleInProgress = false;
    bot.usersInRaffle.clear();
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

CHAT_HANDLERS.set('smp', async (bot, username, msg) => {
  if (!await bot.db.moduleIsEnabled('smp')) {
    bot.sendChatMsg('smp module is disabled. To enable, use $module smp on');
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have points to do a slot machine pull with Sadeg`);
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

  let win = 0;
  const symbs = [
    'xqcL',
    'PagMan',
    'TriHard',
    'klaiusGuraRickRoll',
    'FEELSWAYTOOGOOD',
    'FeelsOkayMan',
    'monkaS',
    '4HEad',
    'pepegaGamble',
    'Okayeg',
    'ForsenLookingAtYou',
    'mendoUWU',
    'CrabPls',
    'mendoUA',
    'DonkDink',
    'CaitlynS',
    'Bald1G',
    'veiO',
    'OnionWTF',
    'elisComfy',
    'elisNom',
    'PagPls',
    'halalChad',
    'monkaPog',
    'PoroSad',
    'DansGame',
  ];
  const sl1 = symbs[randomInt(symbs.length)];
  const sl2 = symbs[randomInt(symbs.length)];
  const sl3 = symbs[randomInt(symbs.length)];
  if (sl1 === sl2 && sl1 === sl3) {
    if (sl1 === 'xqcL' || sl1 === 'PagMan' || sl1 === 'TriHard' || sl1 === 'klaiusGuraRickRoll' ||
        sl1 === 'FEELSWAYTOOGOOD') {
      win = (gambledPoints * 50);
    } else if (
        sl1 === 'monkaPog' || sl1 === 'halalChad' || sl1 === 'PagPls' || sl1 === 'CrabPls' ||
        sl1 === 'Okayeg' || sl1 === 'CaitlynS' || sl1 === 'veiO' || sl1 === 'mendoUA' ||
        sl1 === 'elisNom' || sl1 === 'mendoUWU' || sl1 === 'FeelsOkayMan' || sl1 === 'monkaS') {
      win = (gambledPoints * 35);
    } else {
      win = (gambledPoints * 25);
    }
  }
  if (sl1 === sl3 && sl1 !== sl2) {
    if (sl1 === 'xqcL' || sl1 === 'PagMan' || sl1 === 'TriHard' || sl1 === 'klaiusGuraRickRoll' ||
        sl1 === 'FEELSWAYTOOGOOD' || sl3 === 'xqcL' || sl3 === 'PagMan' || sl3 === 'TriHard' ||
        sl3 === 'klaiusGuraRickRoll' || sl3 === 'FEELSWAYTOOGOOD') {
      win = (gambledPoints * 20);
    } else if (
        sl1 === 'monkaPog' || sl1 === 'halalChad' || sl1 === 'PagPls' || sl1 === 'CrabPls' ||
        sl1 === 'Okayeg' || sl1 === 'CaitlynS' || sl1 === 'veiO' || sl1 === 'mendoUA' ||
        sl1 === 'elisNom' || sl1 === 'mendoUWU' || sl1 === 'FeelsOkayMan' || sl1 === 'monkaS' ||
        sl3 === 'monkaPog' || sl3 === 'halalChad' || sl3 === 'PagPls' || sl3 === 'CrabPls' ||
        sl3 === 'Okayeg' || sl3 === 'CaitlynS' || sl3 === 'veiO' || sl3 === 'mendoUA' ||
        sl3 === 'elisNom' || sl3 === 'mendoUWU' || sl3 === 'FeelsOkayMan' || sl3 === 'monkaS') {
      win = (gambledPoints * 5);
    } else {
      win = (gambledPoints * 2);
    }
  }
  if (sl2 === sl3 && sl1 !== sl2) {
    if (sl2 === 'xqcL' || sl2 === 'PagMan' || sl2 === 'TriHard' || sl2 === 'klaiusGuraRickRoll' ||
        sl2 === 'FEELSWAYTOOGOOD' || sl3 === 'xqcL' || sl3 === 'PagMan' || sl3 === 'TriHard' ||
        sl3 === 'klaiusGuraRickRoll' || sl3 === 'FEELSWAYTOOGOOD') {
      win = (gambledPoints * 20);
    } else if (
        sl2 === 'monkaPog' || sl2 === 'halalChad' || sl2 === 'PagPls' || sl2 === 'CrabPls' ||
        sl2 === 'Okayeg' || sl2 === 'CaitlynS' || sl2 === 'veiO' || sl2 === 'mendoUA' ||
        sl2 === 'elisNom' || sl2 === 'mendoUWU' || sl2 === 'FeelsOkayMan' || sl2 === 'monkaS' ||
        sl3 === 'monkaPog' || sl3 === 'halalChad' || sl3 === 'PagPls' || sl3 === 'CrabPls' ||
        sl3 === 'Okayeg' || sl3 === 'CaitlynS' || sl3 === 'veiO' || sl3 === 'mendoUA' ||
        sl3 === 'elisNom' || sl3 === 'mendoUWU' || sl3 === 'FeelsOkayMan' || sl3 === 'monkaS') {
      win = (gambledPoints * 5);
    } else {
      win = (gambledPoints * 2);
    }
  }
  if (sl1 === sl2 && sl1 !== sl3) {
    if (sl1 === 'xqcL' || sl1 === 'PagMan' || sl1 === 'TriHard' || sl1 === 'klaiusGuraRickRoll' ||
        sl1 === 'FEELSWAYTOOGOOD' || sl2 === 'xqcL' || sl2 === 'PagMan' || sl2 === 'TriHard' ||
        sl2 === 'klaiusGuraRickRoll' || sl2 === 'FEELSWAYTOOGOOD') {
      win = (gambledPoints * 20);
    } else if (
        sl1 === 'monkaPog' || sl1 === 'halalChad' || sl1 === 'PagPls' || sl1 === 'CrabPls' ||
        sl1 === 'Okayeg' || sl1 === 'CaitlynS' || sl1 === 'veiO' || sl1 === 'mendoUA' ||
        sl1 === 'elisNom' || sl1 === 'mendoUWU' || sl1 === 'FeelsOkayMan' || sl1 === 'monkaS' ||
        sl2 === 'monkaPog' || sl2 === 'halalChad' || sl2 === 'PagPls' || sl2 === 'CrabPls' ||
        sl2 === 'Okayeg' || sl2 === 'CaitlynS' || sl2 === 'veiO' || sl2 === 'mendoUA' ||
        sl2 === 'elisNom' || sl2 === 'mendoUWU' || sl2 === 'FeelsOkayMan' || sl2 === 'monkaS') {
      win = (gambledPoints * 5);
    } else {
      win = (gambledPoints * 2);
    }
  }
  if (win === 0) {
    const delta = -gambledPoints;
    await bot.db.updateUserPoints(username, delta);
    bot.sendChatMsg(`| ${sl1} | ${sl2} | ${sl3} |
     ${username} lost ${gambledPoints} in smp OMEGALUL`);
  }
  if (win > 0) {
    await bot.db.updateUserPoints(username, win);
    bot.sendChatMsg(`| ${sl1} | ${sl2} | ${sl3} | ${username} won ${win} in smp EZ Clap`);
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

CHAT_HANDLERS.set('talk', (bot, username, msg) => {
  if ((new Date().getTime() - bot.timeSinceLastTalk) / 1000 < 5) {
    return bot.sendPm(username, 'Talk cooldown');
  }

  bot.timeSinceLastTalk = new Date().getTime();
  bot.talk(msg, (resp) => bot.sendChatMsg(resp));
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

CHAT_HANDLERS.set('translate', (bot, username, msg) => {
  if (!msg) {
    return;
  }

  if ((new Date().getTime() - bot.timeSinceLastTranslate) / 1000 < 5) {
    return bot.sendChatMsg('Translate cooldown');
  }

  bot.timeSinceLastTranslate = new Date().getTime();
  const groups = msg.match(/^(\[(([A-z]{2})|([A-z]{2}) ?-?> ?([A-z]{2}))\] ?)?(.+)$/);

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
  if (!bot.weatherUndergroundApiKey) {
    return bot.sendChatMsg('No weatherunderground API key!');
  } else if (!msg || bot.muted) {
    return;
  }

  const now = Date.now();
  const waitTime =
      ((bot.weatherLimiter.curIntervalStart + bot.weatherLimiter.tokenBucket.interval) - now) /
      1000;

  if (bot.weatherLimiter.getTokensRemaining() < 1) {
    bot.sendChatMsg(`Too many requests sent. Available in: ${waitTime} seconds`);
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
  callWeather(msg, bot.weatherUndergroundApiKey, postAPI);
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
