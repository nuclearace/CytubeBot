/**
 * Default commands.
 */

import {randomInt} from 'crypto';
import humanizeDuration from 'humanize-duration';
import parseDuration from 'parse-duration';

import {Rank} from '../constants.js';
import {auditLog, infoLog} from '../logger.js';
import {sendHybridModPermissions} from '../permissions.js';
import {filterMsg, genericUIDLoop, getCurrentUnixTimestamp, getUser, parseBumpData, parseDeleteData, parseMediaLink, parseUserlimit, sendMessagesWithRateLimit, sleep} from '../utils.js';
import {validateYouTubeVideo} from '../validate.js';

/** @typedef {import('./handle.js').Handler} Handler */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
export const COMMANDS = new Map();

COMMANDS.set('add', async (bot, username, msg) => {
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

COMMANDS.set('addemote', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD))) {
    bot.sendChatMsg(`${username} does not have permission to $addemote. FeelsWeirdMan`);
    return;
  }

  const emoteToAdd = msg.split(' ')[0] || null;
  const eLinkToAdd = msg.split(' ')[1] || null;
  if (emoteToAdd === null || eLinkToAdd === null) {
    bot.sendChatMsg(`[red]Invalid syntax.[/] Syntax: $addemote emoteName emoteLink`);
    return;
  }

  bot.addEmote(emoteToAdd, eLinkToAdd);
  await sleep(50);
  bot.sendChatMsg(`Added emote ${emoteToAdd}`);
});

COMMANDS.set('addrandom', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'R'))) {
    bot.sendChatMsg(`${username} does not have permission to addrandom. FeelsWeirdMan`);
    return;
  }

  const num = parseInt(msg.split(' ')[0], 10);
  if (isNaN(num)) {
    bot.sendChatMsg(`Couldn't parse count. Ex: $addrandom 10`);
    return;
  }

  if (num > 10) {
    return;
  }

  const user = msg.split(' ')[1] || null;

  bot.addRandomVideos(num, user);
});

COMMANDS.set('allow', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to allow. FeelsWeirdMan`);
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

  // if (!(await bot.checkPermission(user, Rank.MOD, null))) {
  //   bot.sendChatMsg(`${username} does not have permission to allow. FeelsWeirdMan`);
  //   return;
  // }

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

COMMANDS.set('ask', (bot, username, msg) => {
  const answers = ['Yes', 'No'];
  const answer = answers[randomInt(answers.length)];
  const words = msg.split(' ');
  for (let w = 0; w < words.length; w++) {
    if (words[w].endsWith('do')) {
      for (let w = 0; w < words.length; w++) {
        if (words[w].startsWith('poof')) {
          bot.sendChatMsg(`Nice try forsenCD`);
          return;
        }
      }
    }
  }
  bot.sendChatMsg(`"${msg}"? ${answer}.`);
});

COMMANDS.set('autodelete', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to autodelete. FeelsWeirdMan`);
    return;
  }

  bot.blockVideo();
});

COMMANDS.set('ban', async (bot, username, msg) => {
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

COMMANDS.set('blacklist', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to blacklist. FeelsWeirdMan`);
    return;
  }

  bot.blacklistVideo();
  bot.sendChatMsg('Blacklisted current video.');
});

COMMANDS.set('blacklistedusers', (bot, username, msg) => {
  bot.listBlacklistedUsers();
});

COMMANDS.set('blacklistuser', async (bot, username, msg) => {
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

COMMANDS.set('blockedusers', (bot, username, msg) => {
  bot.listBlockedUsers();
});

COMMANDS.set('blockuser', async (bot, username, msg) => {
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

COMMANDS.set('bump', async (bot, username, msg) => {
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

COMMANDS.set('checkplaylist', (bot) => {
  bot.checkPlaylist();
});

COMMANDS.set('cleandatabasevideos', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.FOUNDER, null))) {
    bot.sendChatMsg(
        `${username} does not have permission to cleandatabasevideos. ` +
        `FeelsWeirdMan`);
    return;
  }

  bot.cleanDatabaseVideos();
});

COMMANDS.set('choose', (bot, username, msg) => {
  if (!msg) {
    return;
  }

  const words = msg.split(' ');
  for (let w = 0; w < words.length; w++) {
    if (words[w].endsWith('do')) {
      for (let w = 0; w < words.length; w++) {
        if (words[w].startsWith('poof')) {
          bot.sendChatMsg(`Nice try forsenCD`);
          return;
        }
      }
    }
  }

  const choices = msg.trim().split(' ');
  const choice = choices[Math.floor(Math.random() * choices.length)];
  bot.sendChatMsg(`[Choose: ${choices.join(' ')} ] ${choice}`);
});

COMMANDS.set('clearchat', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'M'))) {
    bot.sendChatMsg(`${username} does not have permission to clearchat. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('/clear', true);
});

COMMANDS.set('currenttime', (bot, username, msg) => {
  const currentTime = Math.round(bot.leaderData.currentTime);
  bot.sendChatMsg(`Current Time: ${currentTime}`);
});

COMMANDS.set('delete', async (bot, username, msg) => {
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

COMMANDS.set('deletevideos', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.FOUNDER, null))) {
    bot.sendChatMsg(`${username} does not have permission to deletevideos. FeelsWeirdMan`);
    return;
  }

  bot.deleteVideosFromDatabase(msg);
});

COMMANDS.set('disallow', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD))) {
    bot.sendChatMsg(`${username} does not have permission to disallow. FeelsWeirdMan`);
    return;
  }

  const match = msg.match(/(\w*)/);
  if (!match) {
    return;
  }

  const user = match[1];
  const caller = getUser(bot, username);

  if (user === bot.username) {
    return;
  }

  // if (!(await bot.checkPermission(user, Rank.MOD))) {
  //   return;
  // }

  const rank = await bot.db.getUserRank(user);

  const lesserOrEqualUser = user && caller.rank <= rank;

  if (lesserOrEqualUser && !userAlsoHasPermission) {
    return bot.disallowUser(user, true);
  } else if (lesserOrEqualUser && userAlsoHasPermission) {
    return;
  }

  return bot.disallowUser(user, true);
});

COMMANDS.set('duplicates', async (bot, username, msg) => {
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

COMMANDS.set('endpoll', async (bot, username, msg) => {
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

COMMANDS.set('ecount', emoteCountHandler);
COMMANDS.set('emotecount', emoteCountHandler);

COMMANDS.set('emotes', (bot, username, msg) => {
  if (!bot.enableWebServer) {
    return bot.sendChatMsg('WebServer not enabled');
  }

  bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/emotes`);
});

COMMANDS.set('eremove', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD))) {
    bot.sendChatMsg(`${username} does not have permission to use $eremove. FeelsWeirdMan`);
    return;
  }

  const emName = msg.split(' ')[0];
  if (emName === '') {
    bot.sendChatMsg('[red]Invalid syntax.[/] Syntax: $eremove emoteName');
    return;
  }

  // if (!bot.channelEmotes.map((emote) => emote.name).includes(emName)) {
  //   bot.sendChatMsg(`[red]${emName}[/] isn't an emote`);
  //   return;
  // }

  bot.removeEmote(emName);
  await sleep(50);
  bot.sendChatMsg(`Removed emote ${emName}`);
});

COMMANDS.set('help', (bot, username, msg) => {
  bot.sendChatMsg('https://github.com/airforce270/CytubeBot/blob/master/README.md#commands');
});

COMMANDS.set('ipban', async (bot, username, msg) => {
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

COMMANDS.set('kick', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.MOD, 'I'))) {
    bot.sendChatMsg(`${username} does not have permission to kick. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg(`/kick ${msg}`, true);
});

COMMANDS.set('listpermissions', (bot, username, msg) => {
  const name = msg || username;
  sendHybridModPermissions(bot, name.toLowerCase());
});

COMMANDS.set('module', async (bot, username, msg) => {
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

COMMANDS.set('modulesoff', async (bot, username, msg) => {
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

COMMANDS.set('moduleson', async (bot, username, msg) => {
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

COMMANDS.set('mute', async (bot, username, msg) => {
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

COMMANDS.set('nonotifylive', async (bot, username, msg) => {
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

COMMANDS.set('permissions', async (bot, username, msg) => {
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

COMMANDS.set('poll', async (bot, username, msg) => {
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

COMMANDS.set('poof', async (bot, username, msg) => {
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

COMMANDS.set('purge', (bot, username, msg) => {
  if (!msg) {
    msg = username;
  }

  msg = `${msg.trim()} all`;
  COMMANDS.get('delete')(bot, username, msg);
});

COMMANDS.set('quote', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : null;

  const quote = await bot.db.getQuote(target);
  if (!quote) {
    return;
  }

  const quotedMsg = filterMsg(quote.msg);
  const time = new Date(quote.timestamp);
  const timestamp = time.toDateString() + ' ' + time.toTimeString().split(' ')[0];
  const words = quotedMsg.split(' ');
  for (let w = 0; w < words.length; w++) {
    if (words[w].endsWith('do')) {
      for (let w = 0; w < words.length; w++) {
        if (words[w].startsWith('poof')) {
          words[w] = 'p00f';
          bot.sendChatMsg(`[${quote.username} ${timestamp}] ${words.join(' ')}`);
          return;
        }
      }
    }
  }

  bot.sendChatMsg(`[${quote.username} ${timestamp}] ${quotedMsg}`);
});

COMMANDS.set('randomemote', (bot, username, msg) => {
  const randomIndex = randomInt(bot.channelEmotes.length - 1);
  const randomEmote = bot.channelEmotes[randomIndex];
  bot.sendChatMsg(randomEmote.name);
});

COMMANDS.set('rngban', async (bot, username, msg) => {
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

COMMANDS.set('rngkick', async (bot, username, msg) => {
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

COMMANDS.set('rngtempban', async (bot, username, msg) => {
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

COMMANDS.set('rngtimeout', async (bot, username, msg) => {
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

COMMANDS.set('settime', async (bot, username, msg) => {
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

COMMANDS.set('#showemote', async (bot, username, msg) => {
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

COMMANDS.set('shuffle', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'U'))) {
    bot.sendChatMsg(`${username} does not have permission to shuffle. FeelsWeirdMan`);
    return;
  }

  bot.shufflePlaylist();
});

COMMANDS.set('skip', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'S'))) {
    bot.sendChatMsg(`${username} does not have permission to skip. FeelsWeirdMan`);
    return;
  }

  bot.deleteVideo(bot.currentUID);
});

COMMANDS.set('slowmode', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD))) {
    bot.sendChatMsg(`${username} does not have permission to use $slowmode. FeelsWeirdMan`);
    return;
  }

  const action = msg.split(' ')[0];
  if (action === 'on') {
    bot.sendChatMsg('Slowmode enabled ppHop');
    return bot.setSlowmode(1);
  }
  if (action === 'off') {
    bot.sendChatMsg(`Slowmode disabled ppOverheat`);
    return bot.setSlowmode(2);
  }
  if (action === 'reg') {
    bot.sendChatMsg(`Slowmode set to regular ppHopper`);
    return bot.setSlowmode(3);
  }
});

COMMANDS.set('spam', async (bot, username, msg) => {
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

COMMANDS.set('tempban', async (bot, username, msg) => {
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

COMMANDS.set('tempbans', async (bot, username, msg) => {
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

COMMANDS.set('timeout', async (bot, username, msg) => {
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

COMMANDS.set('timeouts', async (bot, username, msg) => {
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

COMMANDS.set('title', async (bot, username, msg) => {
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
  const title = channel.title;
  const words = title.split(' ');
  for (let w = 0; w < words.length; w++) {
    if (words[w].endsWith('do')) {
      for (let w = 0; w < words.length; w++) {
        if (words[w].startsWith('poof')) {
          bot.sendChatMsg(`Nice try forsenCD`);
          return;
        }
      }
    }
  }
  const cmdCheck = words[0];
  if (cmdCheck === '/ban') {
    bot.sendChatMsg(`/ban ${username}`);
    bot.sendChatMsg(`Nice try :tf: %^^%Title: ${channel.title}`);
    await sleep(5000);
    const unbanRequest = {
      unban: true,
      fun: (callback) => {
        const bans = bot.banlist.filter((ban) => ban.name.toLowerCase() === username.toLowerCase());
        if (bans.length === 0) {
          bot.sendChatMsg(`${username} doesn't appear to be banned monkaHmm`);
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

    await bot.db.setUserTempBan(username, 0);
    return;
  } else if (cmdCheck === '/kick') {
    bot.sendChatMsg(`/kick ${username}`);
    bot.sendChatMsg(`Nice try :tf: %^^%Title: ${channel.title}`);
    return;
  } else if (cmdCheck === '/ipban') {
    bot.sendChatMsg(`/ban ${username}`);
    bot.sendChatMsg(`Nice try :tf: %^^%Title: ${channel.title}`);
    await sleep(5000);
    const unbanRequest = {
      unban: true,
      fun: (callback) => {
        const bans = bot.banlist.filter((ban) => ban.name.toLowerCase() === username.toLowerCase());
        if (bans.length === 0) {
          bot.sendChatMsg(`${username} doesn't appear to be banned monkaHmm`);
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

    await bot.db.setUserTempBan(username, 0);
    return;
  } else if (cmdCheck === '/mute') {
    bot.sendChatMsg(`/mute ${username}`);
    bot.sendChatMsg(`Nice try :tf: %^^%Title: ${channel.title}`);
    return;
  }

  bot.sendChatMsg(channel.title);
});

COMMANDS.set('unban', async (bot, username, msg) => {
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

COMMANDS.set('unmute', async (bot, username, msg) => {
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

COMMANDS.set('userlimit', async (bot, username, msg) => {
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
