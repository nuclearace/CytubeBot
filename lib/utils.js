import {errlog} from './logger.js';

/** @typedef {import('./cytubebot.js').CytubeBot} CytubeBot */
/** @typedef {import('sqlite3').Database} Database */
/** @typedef {import('sqlite3').Statement} Statement */

/**
 * Checks to see if a user is in the userlist.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} user User to find.
 * @return {boolean} Whether the user is in the bot's userlist.
 */
export function userInUserlist(bot, user) {
  for (const botUser of bot.userlist) {
    if (botUser.name === user) {
      return true;
    }
  }
  return false;
}

/**
 * Looks for user, returning the user index
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} user User to find.
 * @return {number?} Index of the user in the bot's userlist.
 */
export function findUser(bot, user) {
  for (const [i, botUser] of bot.userlist.entries()) {
    if (botUser.name.toLowerCase() === user.toLowerCase()) {
      return i;
    }
  }
}

/**
 * Sends messages with proper rate limiting so as to not crash the bot.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {!Array<string>} messages Messages to send.
 */
export async function sendMessagesWithRateLimit(bot, messages) {
  let waitTimeMs = 50;
  if (messages.length > 20) {
    // For spams of >20 messages, the bot crashes unless we rate-limit it to
    // ~120ms between messages.
    waitTimeMs = 120;
  }

  for (const [i, message] of messages.entries()) {
    await sleep((1 + i) * waitTimeMs);
    bot.sendChatMsg(message);
  }
}

/**
 * Sends messages with proper rate limiting so as to not crash the bot.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} to User to send the PMs to.
 * @param {!Array<string>} pms PMs to send.
 */
export async function sendPMsWithRateLimit(bot, to, pms) {
  let waitTimeMs = 50;
  if (pms.length > 20) {
    // For spams of >20 messages, the bot crashes unless we rate-limit it to
    // ~120ms between messages.
    waitTimeMs = 120;
  }

  for (const [i, pm] of pms.entries()) {
    await sleep((1 + i) * waitTimeMs);
    bot.sendPM(to, pm);
  }
}

/**
 * Looks for user, returning the user object
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} user User to find.
 * @return {number?} The user object.
 */
export function getUser(bot, user) {
  for (const botUser of bot.userlist) {
    if (botUser.name.toLowerCase() === user.toLowerCase()) {
      return botUser;
    }
  }
}

/**
 * Checks if the video is on the playlist.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {?} video The video to look for.
 * @return {boolean} Whether the video is in the playlist.
 */
export function isOnPlaylist(bot, video) {
  for (const playlistVideo of bot.playlist) {
    if (playlistVideo.media.id === video.item.media.id) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the video from a UID.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {?} uid UID of the video we are looking for.
 * @return {?|null} The object, if we found it.
 */
export function getVideoFromUID(bot, uid) {
  for (const video of bot.playlist) {
    if (video.uid === uid) {
      return video;
    }
  }
}

/** @typedef {{uid: number, index: number}} VideoIndex */

/**
 * Finds the index(s) of a video using a video object.
 *
 * Compares using the ids.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {?} video Video to find the index of.
 * @return {!Array<VideoIndex>} An array containing indices and the uid.
 */
export function findIndexOfVideoFromVideo(bot, video) {
  const returnData = [];
  for (const [i, item] of bot.playlist.entries()) {
    if (item.media.id !== video.media.id) {
      continue;
    }
    returnData.push({uid: item.uid, index: i});
  }
  return returnData;
}

/**
 * Finds the index of a video using the UID.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} uid UID of the video we are looking for.
 * @return {number?} The index.
 */
export function findIndexOfVideoFromUID(bot, uid) {
  for (const [i, video] of bot.playlist.entries()) {
    if (video.uid === uid) {
      return i;
    }
  }
}

/**
 * Finds all videos added by a user.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} name The name of the user we are finding videos for.
 * @return {!Array<string>} An array of UIDs.
 */
export function findVideosAddedByUser(bot, name) {
  if (!name) {
    return;
  }
  return bot.playlist
      .filter((video) => video.queueby.toLowerCase() === name.toLowerCase())
      .map((video) => video.uid);
}

/**
 * Finds all videos that match title.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} title The title we are trying to match.
 * @return {!Array<string>} A list of uids.
 */
export function findVideosFromTitle(bot, title) {
  if (!title) {
    return [];
  }

  const regExEsc = (str) => String(str)
                                .replace(/[\\\[\].()|{}$+*?!:^,#<-]/g, '\\$&')
                                .replace(/\x08/g, '\\x08');
  const reg = new RegExp('.*' + regExEsc(title) + '.*', 'ig');

  return bot.playlist.filter((video) => video.media.title.match(reg))
      .map((video) => video.uid);
}

/**
 * Filters an incoming chatMsg or database quote of HTML entities and htmltags.
 *
 * @param {string} msg The message to filter.
 * @return {string} The filtered message.
 */
export function filterMsg(msg) {
  return msg.replace(/&#39;/g, `'`)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#40;/g, '\(')
      .replace(/&#41;/g, '\)')
      .replace(/(<([^>]+)>)/ig, '')
      .replace(/^[ \t]+/g, '');
}

/**
 * Data for genericUIDLoop.
 *
 * @typedef {Object} GenericUidLoopData
 * @property {string} name Name of emote.
 * @property {string} image URL of emote source.
 * @property {string} source Regex pattern matching an emote.
 * @property {string} kind The function we want to use. eg sendMoveMedia.
 * @property {number|string} num: The number or "all".
 * @property {!Array<string>} uids: The uids of the videos.
 */

/**
 * Generic loop for UIDs.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {GenericUidLoopData} data Data to use.
 */
export function genericUIDLoop(bot, data) {
  if (!data) {
    return;
  }

  const kind = data.kind;
  const num = data.num;
  const uids = data.uids;

  if (!bot[kind]) {
    errlog.log(`!~~~! genericUIDLoop No such method: ${kind}`);
    return;
  }

  if (!num) {
    // We should use the first uid.
    bot[kind](uids[0]);
  } else if (num === 'all') {
    // We should use all the uids.
    for (const uid of uids) {
      bot[kind](uid);
    }
  } else {
    // We should use num uids.
    for (let i = 0; i < num; i++) {
      if (i > uids.length) {
        break;
      }
      bot[kind](uids[i]);
    }
  }
}

/**
 * Determine what to bump.
 *
 * Used by $bump.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {?} bumpData The data from bump in chatcommands
 * @return {{kind: string, num: number, uids: !Array<string>}} An object
 *     containing the number to bump and the uids.
 */
export function parseBumpData(bot, bumpData) {
  if (!bumpData) {
    return bot.sendChatMsg('Incorrect format');
  }

  const splitData = bumpData.split(' ');

  const bumpKind = splitData.splice(0, 1)[0];
  const bumpAmount = splitData[splitData.length - 1];
  let num = 0;
  let uids = [];

  if (bumpAmount) {
    if (bumpAmount.toLowerCase() === 'all') {
      num = 'all';
      splitData.splice(splitData.length - 1, 1);
    } else if (!isNaN(parseInt(bumpAmount))) {
      num = bumpAmount;
      splitData.splice(splitData.length - 1, 1);
    }
  }

  // We don't have enough info to continue
  if (splitData.length === 0 || !splitData[0]) {
    return bot.sendChatMsg('Incorrect format');
  }

  if (bumpKind === '-user') {
    uids = findVideosAddedByUser(bot, splitData[0]).reverse();
  } else if (bumpKind === '-title') {
    uids = findVideosFromTitle(bot, splitData.join(' ')).reverse();
  }

  return {
    kind: 'sendMoveMedia',
    num: num,
    uids: uids,
  };
}

/**
 * Parses the data given to delete.
 *
 * Used by $delete.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {?} deleteData The data from $delete.
 * @return {{kind: string, name: string, num: number, uids: !Array<string>}} An
 *     object containing items needed for the generic uid loop.
 */
export function parseDeleteData(bot, deleteData) {
  const userData = deleteData.userData.split(' ');
  let name = '';
  let num = 0;

  // If delete is called with a number or no args, we assume the caller wants to
  // delete their own videos
  if (!userData || userData.length === 1) {
    if (userData[0] && !isNaN(parseInt(userData[0])) ||
        userData[0] && userData[0] === 'all') {
      name = deleteData.username;
      num = userData[0];
    } else if (userData[0] && isNaN(parseInt(userData[0]))) {
      name = userData[0];
    } else {
      name = deleteData.username;
    }
  } else {
    name = userData[0];
    num = userData[userData.length - 1];
  }

  const uids = findVideosAddedByUser(bot, name);

  if (!num) {
    num = 1;
  } else if (num.toLowerCase() === 'all') {
    num = uids.length;
  }

  return {
    kind: 'deleteVideo',
    name: name,
    num: num,
    uids: uids.reverse(),
  };
}

/**
 * Parses a link from $add.
 *
 * Used to send queue frames via addVideo.
 *
 * @param {string} url The URL of the video to parse.
 * @return {{id: string?, type: string?}} The parsed link.
 */
export function parseMediaLink(url) {
  if (typeof url !== 'string') {
    return {
      id: null,
      type: null,
    };
  }
  url = url.trim();

  // JWPlayer
  if (url.indexOf('jw:') === 0) {
    return {
      id: url.substring(3),
      type: 'jw',
    };
  }

  // RTMP server
  if (url.indexOf('rtmp://') === 0) {
    return {
      id: url,
      type: 'rt',
    };
  }

  let m;
  // YouTube
  if ((m = url.match(/youtube\.com\/watch\?v=([^&#]+)/))) {
    return {
      id: m[1],
      type: 'yt',
    };
  }

  // Short YouTube link
  if ((m = url.match(/youtu\.be\/([^&#]+)/))) {
    return {
      id: m[1],
      type: 'yt',
    };
  }

  // YouTube playlist
  if ((m = url.match(/youtube\.com\/playlist\?list=([^&#]+)/))) {
    return {
      id: m[1],
      type: 'yp',
    };
  }

  // Twitch.tv
  if ((m = url.match(/twitch\.tv\/([^&#]+)/))) {
    return {
      id: m[1],
      type: 'tw',
    };
  }

  // Justin.tv
  if ((m = url.match(/justin\.tv\/([^&#]+)/))) {
    return {
      id: m[1],
      type: 'jt',
    };
  }

  // livestream.com
  if ((m = url.match(/livestream\.com\/([^&#]+)/))) {
    return {
      id: m[1],
      type: 'li',
    };
  }

  // ustream.tv
  if ((m = url.match(/ustream\.tv\/([^&#]+)/))) {
    return {
      id: m[1],
      type: 'us',
    };
  }

  // Vimeo.com
  if ((m = url.match(/vimeo\.com\/([^&#]+)/))) {
    return {
      id: m[1],
      type: 'vi',
    };
  }

  // dailymotion.com
  if ((m = url.match(/dailymotion\.com\/video\/([^&#]+)/))) {
    return {
      id: m[1],
      type: 'dm',
    };
  }

  // imgur.com
  // Because people actually use this (not)
  if ((m = url.match(/imgur\.com\/a\/([^&#]+)/))) {
    return {
      id: m[1],
      type: 'im',
    };
  }

  // soundcloud.com
  if ((m = url.match(/soundcloud\.com\/([^&#]+)/))) {
    return {
      id: url,
      type: 'sc',
    };
  }

  // Google drive links
  if ((m = url.match(/docs\.google\.com\/file\/d\/([^\/]*)/))) {
    return {
      id: m[1],
      type: 'gd',
    };
  }

  const temp = url.split('?')[0];
  if (temp.match(/^http:\/\//)) {
    if (temp.match(/\.(mp4|flv|webm|og[gv]|mp3|mov)$/)) {
      return {
        id: url,
        type: 'fi',
      };
    }
  }

  return {
    id: null,
    type: null,
  };
}

/**
 * Handles changes to bot.stats.userlimit.
 *
 * Used by $userlimit.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {!RegExpMatchArray} match Match to use.
 */
export function parseUserlimit(bot, match) {
  let isTrue = true;
  let isFalse = false;
  let num = 0;

  // Both params were given
  if (typeof match[1] !== 'undefined' && typeof match[2] !== 'undefined') {
    isTrue = (match[1] === 'true');
    isFalse = (match[1] === 'false');

    num = parseInt(match[2]);

    if (isTrue) {
      bot.stats.userLimit = isTrue;
    } else if (isFalse) {
      bot.stats.userLimit = !isFalse;
    }
    if (!isNaN(num)) {
      bot.stats.userLimitNum = num;
    }
  } else if (typeof match[1] !== 'undefined' && match[2] === '') {
    // Boolean given
    isTrue = (match[1] === 'true');
    isFalse = (match[1] === 'false');

    if (isTrue) {
      bot.stats.userLimit = isTrue;
    } else if (isFalse) {
      bot.stats.userLimit = !isFalse;
    }
  } else if (typeof match[0] !== 'undefined') {
    num = parseInt(match[0]);
    if (!isNaN(num)) {
      bot.stats.userLimitNum = num;
    }
  }
}

//
//
// bot - Reference to the bot
// forecastData - Data from the api call to weatherunderground

/**
 * Parses and returns the forecast string.
 *
 * Used by $forecast.
 *
 * @param {?} parsedJSON Parsed JSON from the weatherunderground call.
 * @param {!RegExpMatchArray} tomorrow
 * @return {!Array<string>} Forecast strings.
 */
export function parseForecastData(parsedJSON, tomorrow) {
  const forecast = {
    todayDay: parsedJSON.forecast.txt_forecast.forecastday[0],
    todayNight: parsedJSON.forecast.txt_forecast.forecastday[1],
    tomorrowDay: parsedJSON.forecast.txt_forecast.forecastday[2],
    tomorrowNight: parsedJSON.forecast.txt_forecast.forecastday[3],
  };

  const location = parsedJSON.current_observation.display_location.full;

  const returnStrings = [];

  if (tomorrow) {
    if ((location.split(', ')[1]).length != 2) {
      returnStrings.push(
          `Location: ${location} ` +
          `Tomorrow: ${forecast.tomorrowDay.fcttext_metric}`);

      returnStrings.push(
          `Tomorrow Night: ${forecast.tomorrowNight.fcttext_metric}`);
    } else {
      returnStrings.push(
          `Location: ${location} ` +
          `Tomorrow: ${forecast.tomorrowDay.fcttext}`);

      returnStrings.push(`Tomorrow Night: ${forecast.tomorrowNight.fcttext}`);
    }
  } else {
    if ((location.split(', ')[1]).length != 2) {
      returnStrings.push(
          `Location: ${location} Today: ${forecast.todayDay.fcttext_metric}`);

      returnStrings.push(`Tonight: ${forecast.todayNight.fcttext_metric}`);
    } else {
      returnStrings.push(
          `Location: ${location} Today: ${forecast.todayDay.fcttext}`);

      returnStrings.push(`Tonight: ${forecast.todayNight.fcttext}`);
    }
  }
  return returnStrings;
}

/**
 * Loops through the bot's waitingFunctions looking for one that matches `fun`.
 *
 * @param {!CytubeBot} bot Reference to the CytubeBot.
 * @param {string} fun The type of function we are looking for.
 */
export function loopThroughWaiting(bot, fun) {
  for (const [i, waitingFunction] of bot.waitingFunctions.entries()) {
    if (!waitingFunction[fun]) {
      continue;
    }
    waitingFunction.fun(() => bot.waitingFunctions.splice(i, 1));
  }
}

/**
 * Run a query on a sqlite3 database, returning a promise for its completion.
 *
 * @param {Database} db Database to run the query on.
 * @param {string} query Query to run.
 * @return {!Promise<?>} Promise of the run's completion.
 */
export function dbRun(db, query) {
  return new Promise((resolve, reject) => db.run(query, (result, err) => {
    if (err) {
      reject(err);
    }
    resolve(result);
  }));
}

/**
 * Run a sqlite3 statement, returning a promise for its completion.
 *
 * @param {Statement} statement Statement to run.
 * @return {!Promise<void>} Promise of the run's completion.
 */
export function dbRunStatement(statement) {
  return new Promise((resolve, reject) => statement.run((err) => {
    if (err) {
      reject(err);
    }
    resolve();
  }));
}

export function getCurrentUnixTimestamp() {
  return Math.round((new Date()).getTime() / 1000);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function kill(afterMs = 500) {
  setTimeout(() => process.exit(0), afterMs);
}
