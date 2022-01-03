import {exec} from 'child_process';

import {callAnagram, callForecast, callGoogleTranslate, callWeather, callWolfram} from './apiclient.js';
import {handle as customHandle} from './custom.js';
import {cytubelog, syslog} from './logger.js';
import {sendHybridModPermissions} from './permissions.js';
import {genericUIDLoop, getUser, parseBumpData, parseDeleteData, parseForecastData, parseMediaLink, parseUserlimit} from './utils.js';
import {validateYouTubeVideo} from './validate.js';

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

  if (!(await bot.checkPermission(username, 2, 'A'))) {
    bot.sendChatMsg(
        `${username} does not have permission to add. FeelsWeirdMan`);
    return;
  }

  let pos = 'end';
  const splitData = msg.split(' ');

  const addFun = function(vid, pos) {
    if (vid.type === 'yt' && bot.youtubeapi) {
      validateYouTubeVideo(bot, vid.id, vid.type, null, (unplayable) => {
        if (unplayable) {
          return;
        } else {
          bot.addVideo(null, null, null, pos, vid);
        }
      });
    } else {
      bot.addVideo(null, null, null, pos, vid);
    }
  };

  if (splitData.length === 2) {
    if (splitData[splitData.length - 1] === 'next') {
      pos = 'next';
      splitData.splice(splitData.length - 1, 1);
      msg = splitData.join('');
    }
  }

  addFun(parseMediaLink(msg), pos);
});

CHAT_HANDLERS.set('addrandom', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, 2, 'R'))) {
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
  if (!(await bot.checkPermission(username, 2, 'M'))) {
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

  if (!(await bot.checkPermission(user, 2, 'M'))) {
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
  if (!(await bot.checkPermission(username, 2, null))) {
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
  if (!(await bot.checkPermission(username, 2, 'N'))) {
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
  if (!(await bot.checkPermission(username, 2, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to blacklist. FeelsWeirdMan`);
    return;
  }

  bot.blacklistVideo();
});

CHAT_HANDLERS.set('blacklistedusers', (bot, username, msg, fromIrc) => {
  bot.listBlacklistedUsers();
});

CHAT_HANDLERS.set('blacklistuser', async (bot, username, msg, fromIrc) => {
  if (typeof msg === 'undefined' || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, 3, null))) {
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
  if (!(await bot.checkPermission(username, 2, null))) {
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
  if (!(await bot.checkPermission(username, 2, 'B'))) {
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
      if (!(await bot.checkPermission(username, 5, null))) {
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
  if (!(await bot.checkPermission(username, 2, 'M'))) {
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
  if (!(await bot.checkPermission(username, 2, 'D'))) {
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
  if (!(await bot.checkPermission(username, 5, null))) {
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
  if (!(await bot.checkPermission(username, 2, 'M'))) {
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

  if (!(await bot.checkPermission(user, 2, 'M'))) {
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
  if (!(await bot.checkPermission(username, 2, 'D'))) {
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
  if (!(await bot.checkPermission(username, 2, 'N'))) {
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
  if (!(await bot.checkPermission(username, 2, 'I'))) {
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
  if (!(await bot.checkPermission(username, 2, 'G'))) {
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

CHAT_HANDLERS.set('mute', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, 2, 'M'))) {
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
  if (!(await bot.checkPermission(username, 2, 'M'))) {
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

CHAT_HANDLERS.set('permissions', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, 3, null))) {
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
  if (!(await bot.checkPermission(username, 2, 'P'))) {
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
  if (!(await bot.checkPermission(username, 2, 'P'))) {
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

CHAT_HANDLERS.set('restart', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, 2, 'K'))) {
    bot.sendChatMsg(
        `${username} does not have permission to restart. FeelsWeirdMan`);
    return;
  }

  // Someone wants this to die.
  if (msg) {
    bot.sendChatMsg(`[kill] ${msg}`);
    setTimeout(() => {
      process.exit(0);
    }, 500);
  } else {
    process.exit(0);
  }
});

CHAT_HANDLERS.set('settime', async (bot, username, msg, fromIrc) => {
  if (fromIrc || !msg) {
    return;
  }
  if (!(await bot.checkPermission(username, 2, 'T'))) {
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
  if (!(await bot.checkPermission(username, 2, 'U'))) {
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
  if (!(await bot.checkPermission(username, 2, 'S'))) {
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
  if (!(await bot.checkPermission(username, 2, 'N'))) {
    bot.sendChatMsg(
        `${username} does not have permission to unban. FeelsWeirdMan`);
    return;
  }

  const unbanFun = (callback) => {
    for (let i = 0; i < bot.banlist.length; i++) {
      if (bot.banlist[i].name.toLowerCase() === msg.toLowerCase()) {
        const unbanJSON = {
          id: bot.banlist[i].id,
          name: bot.banlist[i].name,
        };
        bot.sendUnban(unbanJSON);
      }
    }
    callback();
  };

  // Create an object that will be used to execute the unban when we
  // get the banlist.
  const unbanObject = {
    unban: true,
    fun: unbanFun,
  };

  // Add to the waitlist.
  bot.waitingFunctions.push(unbanObject);
  bot.socket.emit('requestBanlist');
});

// Executes git pull.
// Experimental!
// Only use if bot was installed with git.
CHAT_HANDLERS.set('update', async (bot, username, msg, fromIrc) => {
  if (fromIrc) {
    return;
  }

  const rank = await bot.db.getUserRank(username);
  if (rank < 5) {
    bot.sendChatMsg(
        `${username} does not have permission to update. FeelsWeirdMan`);
    return;
  }

  exec('git pull', (error, stdout, stderr) => {
    const result =
        stdout.replace(/\+/g, '').replace(/\-/g, '').replace(/\(/g, '').replace(
            /\)/g, '');
    if (result.toLowerCase() === 'already uptodate.\n') {
      return bot.sendChatMsg('Already up-to-date.');
    }

    bot.sendChatMsg(result);

    if (result.length > 20) {
      setTimeout(() => process.exit(0), 2000);
    }
  });
});

CHAT_HANDLERS.set('userlimit', async (bot, username, msg, fromIrc) => {
  if (!msg || fromIrc) {
    return;
  }
  if (!(await bot.checkPermission(username, 3, 'L'))) {
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
