import Cleverbot from 'cleverbot-node';
import {readFile, writeFile} from 'fs/promises';
import humanizeDuration from 'humanize-duration';
import {RateLimiter, TokenBucket} from 'limiter';
import {DateTime, Duration} from 'luxon';
import socketIoClient from 'socket.io-client';

import {lookupSocketUrl} from './apiclient.js';
import {addHandlers} from './bothandlers.js';
import {handleChatMessage} from './commands/handle.js';
import {RESTART_TIMES_FILE_NAME} from './constants.js';
import {Cookies} from './cookie.js';
import {Database} from './database.js';
import {Gamba} from './gamba.js';
import {IOServer} from './ioserver.js';
import {auditLog, errorLog, infoLog} from './logger.js';
import * as perms from './permissions.js';
import {TwitchApiClient} from './twitch.js';
import {TwitterClient} from './twitter.js';
import {filterMsg, findIndexOfVideoFromUID, findUser, findVideosAddedByUser, getCurrentUnixTimestamp, getUser, getVideoFromUID, loopThroughWaiting, sleep, userInUserlist} from './utils.js';
import {validateYouTubeVideo} from './validate.js';
import {Server} from './webserver.js';

/**
 * An emote.
 *
 * @typedef {Object} Emote
 * @property {string} name Name of emote.
 * @property {string} image URL of emote source.
 * @property {string} source Regex pattern matching an emote.
 */

/**
 * A user.
 *
 * @typedef {Object} User
 * @property {string} name Name of the user
 * @property {number} rank Rank of the user.
 * @property {Object} profile Profile data.
 * @property {string} profile.image URL of the user's profile picture.
 * @property {string} profile.text User's profile text.
 * @property {Object} meta Metadata.
 * @property {boolean} meta.afk Whether the user is AFK.
 * @property {boolean} meta.muted Whether the user is muted.
 * @property {boolean} meta.smuted Whether the user is shadow muted.
 * @property {!Array<number>} addedMedia Indices of the media the user added (?)
 */

/**
 * A banned user, returned in a socket 'banlist' event.
 *
 * @typedef {Object} BannedUser
 * @property {number} id ID of the banned user (?).
 * @property {string} name Name of the user.
 * @property {string} reason Reason the user was banned.
 * @property {string} bannedby Mod/admin that banned the user.
 * @property {string} ip Obfuscated IP of the user, may be "*".
 */

/**
 * A video in the playlist.
 *
 * @typedef {Object} Video
 * @property {Object} media Media that was queued.
 * @property {string} media.id Unique ID of the video. YT example: "0bZ0hkiIKt0"
 * @property {string} media.title Title of the video.
 * @property {number} media.seconds Length of the video in seconds.
 * @property {string} media.duration Human-readable duration of the video. ex:
 *    "01:13"
 * @property {string} media.type Type/source of the video. Ex: "yt".
 * @property {Object} media.meta Metadata.
 * @property {number} uid UID of the video (within the playlist?)
 * @property {boolean} temp Whether the video is added as temporary.
 * @property {string} queueby User that queued the video.
 */

/**
 * Event fired by the socket 'changeMedia' event.
 *
 * @typedef {Object} ChangeMediaEvent
 * @property {string} id Unique ID of the video. YT example: "0bZ0hkiIKt0"
 * @property {string} title Title of the video.
 * @property {number} seconds Length of the video in seconds.
 * @property {string} duration Human-readable duration of the video. ex: "01:13"
 * @property {string} type Type/source of the video. Ex: "yt".
 * @property {Object} meta Metadata.
 * @property {number} currentTime Current position in the video.
 * @property {boolean} paused Whether the video is paused.
 */

/**
 * Event fired by the socket 'queue' event.
 *
 * @typedef {Object} QueueEvent
 * @property {!Video} item Video that was queued.
 * @property {number} after Index in the playlist the video was queued after.
 */

/**
 * Event fired by the socket 'setUserMeta' event.
 *
 * @typedef {Object} SetUserMetaEvent
 * @property {string} name Name of the user to set meta for.
 * @property {Object} meta Metadata.
 * @property {boolean} meta.afk Whether the user is afk.
 * @property {!Array<string>} meta.aliases The user's aliases.
 * @property {string} meta.ip The user's IP.
 * @property {boolean} meta.muted Whether the user is muted.
 * @property {boolean} meta.smuted Whether the user is shadow muted.
 */

export class CytubeBot {
  constructor(config) {
    // init is its own function because constructors can't be async
    this.init(config);
  }

  async init(config) {
    auditLog.log('Setting up bot');

    // Begin config things

    // Cytube user info
    /** @type {string} */
    this.cytubeServer = config.cytubeServer;
    /** @type {boolean} */
    this.flair = config.usemodflair;
    /** @type {string} */
    this.pw = config.pw;
    /** @type {string} */
    this.room = config.room;
    /** @type {string} */
    this.roomPassword = config.roompassword;
    /** @type {string} */
    this.username = config.username;

    /** @type {number} */
    this.maxVideoLength = config.maxvideolength;

    /** @type {boolean} */
    this.useLogger = config.enableLogging;
    if (!this.useLogger) {
      this.turnOffLogging();
    }

    /** @type {number} */
    this.rouletteWinPercentage = config.rouletteWinPercentage || 50;

    // APIs
    /** @type {string} */
    this.msTranslateClient = config.mstranslateclient;
    /** @type {string} */
    this.msTranslateSecret = config.mstranslatesecret;
    /** @type {string} */
    this.openWeatherApiKey = config.openWeatherApiKey;
    /** @type {string} */
    this.wolframApiKey = config.wolfram ? config.wolfram.toLowerCase() : '';
    /** @type {number} */
    this.youtubeApiKey = config.youtubev3;
    /** @type {string} */
    this.deleteIfBlockedIn = config.deleteIfBlockedIn;
    if (this.deleteIfBlockedIn) {
      this.deleteIfBlockedIn = this.deleteIfBlockedIn.toUpperCase();
    }

    this.twitch = config.twitchClientId && config.twitchClientSecret ?
        new TwitchApiClient(config.twitchClientId, config.twitchClientSecret) :
        null;

    this.twitter = config.twitterBearerToken ? new TwitterClient(config.twitterBearerToken) : null;

    /** @type {boolean} */
    this.enableWebServer = config.enableWebServer;
    /** @type {number} */
    this.socketPort = config.socketPort;
    /** @type {string} */
    this.webURL = config.webURL;
    /** @type {number} */
    this.webPort = config.webPort;

    this.cleverbot = new Cleverbot();
    if (config.cleverbot) {
      this.cleverbot.configure({botapi: config.cleverbot});
    }


    // End config things.

    // Channel data.

    /** @type {!Array<User>} */
    this.userlist = [];
    /** @type {!Array<Video>} */
    this.playlist = [];
    /** @type {?string} */
    this.previousUID = null;
    /** @type {?string} */
    this.currentUID = null;
    /** @type {ChangeMediaEvent} */
    this.currentMedia = {};
    /** @type {{currentTime: number, paused: boolean}} */
    this.leaderData = {currentTime: 0, paused: false};
    /** @type {boolean} */
    this.firstChangeMedia = true;

    /** @type {!Array<!Emote>} */
    this.channelEmotes = [];
    /** @type {!Array<BannedUser>} */
    this.banlist = [];

    // Cooldown times / rate limiters

    /** @type {RateLimiter} */
    this.weatherLimiter = new RateLimiter({tokensPerInterval: 1_000_000 / 31, interval: 'day'});
    /** @type {TokenBucket} */
    this.addVideoLimiter =
        new TokenBucket({bucketSize: 3, tokensPerInterval: 1, interval: 'second'});
    /** @type {RateLimiter} */
    this.wolframLimiter = new RateLimiter({tokensPerInterval: 64, interval: 'day'});
    /** @type {RateLimiter} */
    this.cleverbotLimiter = new RateLimiter({tokensPerInterval: 10_000 / 31, interval: 'day'});
    /** @type {RateLimiter} */
    this.videoLookupLimiter = new RateLimiter({tokensPerInterval: 10, interval: 'second'});
    /** @type {RateLimiter} */
    this.twitterLimiter = new RateLimiter({tokensPerInterval: 500_000 / 31, interval: 'day'});
    /** @type {RateLimiter} */
    this.leaderboardLargeChatLimiter = new RateLimiter({tokensPerInterval: 1, interval: 'minute'});
    /** @type {RateLimiter} */
    this.pyramidLimiter = new RateLimiter({tokensPerInterval: 1, interval: 15 * 1_000});
    /** @type {RateLimiter} */
    this.showemoteLimiter = new RateLimiter({tokensPerInterval: 1, interval: 15 * 1_000});
    /** @type {RateLimiter} */
    this.hereGlobalLimiter = new RateLimiter({tokensPerInterval: 1, interval: 300 * 1_000});
    /** @type {RateLimiter} */
    this.modscmdGlobalLimiter = new RateLimiter({tokensPerInterval: 1, interval: 20 * 1_000});
    /** @type {RateLimiter} */
    this.staffcmdLimiter = new RateLimiter({tokensPerInterval: 1, interval: 60 * 1_000});
    /** @type {number} */
    this.timeSinceLastAnagram = 0;
    /** @type {number} */
    this.timeSinceLastStatus = 0;

    // Bot data
    this.socket = await this.getSocketIoClient(this.cytubeServer, this.room);

    addHandlers(this);

    this.start();

    /** @type {number} */
    this.startTime = new Date().getTime();
    /** @type {!Database} */
    this.db = new Database(this.maxVideoLength);
    /** @type {boolean} */
    this.isLeader = false;
    /** @type {boolean} */
    this.loggedIn = false;
    /** @type {!Array<!Function>} */
    this.waitingFunctions = [];
    /**
     * @type {{
     *    managing: boolean,
     *    muted: boolean,
     *    hybridMods: ?,
     *    userLimit: boolean,
     *    userLimitNum: number,
     *    disallow: !Array<?>
     * }}
     */
    this.stats = {
      managing: false,
      muted: false,
      hybridMods: {},
      userLimit: false,
      userLimitNum: 10,
      disallow: [],
    };

    /**
     * Map of emote names to their current combo.
     * @type {!Map<string, number>}
     */
    this.emoteCombos = new Map();

    this.cookies = new Cookies(this.db);
    this.gamba = new Gamba();

    const hasPersistentSettings = await this.readPersistentSettings();
    if (!hasPersistentSettings) {
      this.writePersistentSettings();
    }
    this.updatePersistentSettings();

    this.startReconcilingTempbans();
    this.startReconcilingTimeouts();

    this.startAutoQueueing();

    this.monitoredTwitchChannels = await this.db.getMonitoredTwitchChannels();

    if (this.twitch) {
      this.startMonitoringTwitchChannels();
    }

    if (this.enableWebServer) {
      this.server = new Server(this);
      this.ioServer = new IOServer(this.socketPort, this);
    }
  }

  /**
   * Adds random videos using the database.
   *
   * @param {number} num Number of random videos to add.
   * @param {string|null} user If provided, only add random videos originally queued by this user.
   */
  async addRandomVideos(num, user) {
    const rows = await this.db.getRandomVideos(num, user);
    if (!rows) {
      return;
    }

    for (const video of rows) {
      this.addVideo(video.type, video.id);
    }
  }


  /**
   * Sends a queue frame to the server.
   *
   * @param {string} type The type of media ie. yt.
   * @param {string} id ID of the video to add.
   * @param {boolean} temp Whether to add the media as temporary.
   * @param {string} pos Position to add the media in.
   * @param {string} parsedLink Param used when $add is called.
   */
  addVideo(type, id, temp, pos, parsedLink) {
    if (typeof pos === 'undefined') {
      pos = 'end';
    }

    if (typeof temp === 'undefined' || temp === null) {
      temp = false;
    }

    const json = {
      id: id,
      type: type,
      pos: pos,
      temp: temp,
    };

    if (parsedLink) {
      json.id = parsedLink.id;
      json.type = parsedLink.type;
    };

    infoLog.log(`!~~~! Sending queue frame for ${json.id}`);
    this.addVideoLimiter.removeTokens(1).then(() => this.socket.emit('queue', json));
  };

  /**
   * Makes it so the user's videos are not stored into the database.
   *
   * Used by $blacklistuser.
   *
   * @param {string} username The user to blacklist.
   * @param {boolean} flag The flag to be set.
   */
  async blacklistUser(username, flag) {
    if (typeof username === 'undefined' || typeof flag === 'undefined') {
      return;
    }

    await this.db.insertUserBlacklist(username, flag);
    this.listBlacklistedUsers();

    if (flag) {
      for (const uid of findVideosAddedByUser(this, username)) {
        this.blacklistVideo(uid);
      }
    }
  }

  /**
   * Blacklists the current video or uid.
   *
   * Used by $blacklist and blockUser().
   *
   * @param {string} uid A video we want to delete.
   */
  blacklistVideo(uid) {
    const flags = 1;
    let {type, id, title} = this.currentMedia;

    if (typeof uid !== 'undefined') {
      const video = getVideoFromUID(this, uid);
      type = video.media.type;
      id = video.media.id;
      title = video.media.title;
    }

    this.db.flagVideo(type, id, flags, title);
  }

  /**
   * Blocks/unblocks a user from adding videos
   *
   * @param {string} username The user we are blocking/unblocking.
   * @param {boolean} flag The value.
   */
  async blockUser(username, flag) {
    if (!username || typeof flag === 'undefined') {
      return;
    }

    await this.db.insertUserBlock(username, flag);
    this.listBlockedUsers();

    if (flag) {
      const uids = findVideosAddedByUser(this, username);
      for (const uid of uids) {
        this.blacklistVideo(uid);
        this.deleteVideo(uid);
      }
    }
  }

  /**
   * Makes it so the current video cannot be added by non-mods.
   *
   * Used by $autodelete.
   */
  blockVideo() {
    const type = this.currentMedia.type;
    const id = this.currentMedia.id;
    const uid = this.currentUID;
    const flags = 2;
    const title = this.currentMedia.title;

    this.db.flagVideo(type, id, flags, title);
    this.deleteVideo(uid);
  }

  /**
   * Checks if the user has a given permission.
   *
   * @param {string} username The user we're looking up.
   * @param {number} rank The rank the user should have.
   * @param {string} permission The permission to look up.
   * @return {!Promise<boolean>} Whether the user has permission.
   */
  async checkPermission(username, rank, permission) {
    return perms.checkPermission(this, username, rank, permission);
  }

  /**
   * Checks if users have too many items on the playlist.
   *
   * If so, delete them.
   */
  checkPlaylist() {
    if (!this.stats.userLimit) {
      return;
    }

    for (let i = 0; i < this.userlist.length; i++) {
      if (this.userlist[i].addedMedia.length <= this.stats.userLimitNum) {
        continue;
      }

      const numToDelete = this.userlist[i].addedMedia.length - this.stats.userLimitNum;
      const uids = this.userlist[i].addedMedia.reverse();

      for (let u = 0; u < numToDelete; u++) {
        this.deleteVideo(uids[u]);
      }
    }
  }

  /**
   * Checks whether a user is blacklisted.
   *
   * @param {string} username The user we are checking.
   * @return {!Promise<boolean>} Whether the user is blacklisted.
   */
  async userIsBlacklisted(username) {
    if (!username) {
      return false;
    }
    return this.db.getUserBlacklist(username);
  };

  /**
   * Checks whether a user is blocked from adding videos or not.
   *
   * @param {string} username The user to lookup.
   * @return {!Promise<boolean>} Whether the user is blocked.
   */
  async checkUserBlock(username) {
    if (!username) {
      return false;
    }
    return this.db.getUserBlock(username);
  }

  async cleanDatabaseVideos() {
    const num = this.db.getVideosCountForClean();
    this.sendChatMsg(`About to check ${num} videos`);
    const videos = await this.db.getRandomVideos(num);
    let count = 0;
    let numFlagged = 0;
    for (const video of videos) {
      if (video.type !== 'yt') {
        return;
      }

      await this.videoLookupLimiter.removeTokens(1);
      count++;
      const {valid} = await validateYouTubeVideo(this, video.id, video.type, video.title);
      if (valid) {
        numFlagged++;
      }

      if (count === num) {
        this.sendChatMsg(`Found ${numFlagged} invalid videos`);
      }
    }
  }

  /**
   * Gets the videos added by username.
   *
   * Adds to their userlist.item.addedMedia.
   *
   * @param {string} username The user we are adding videos to. If not given, we
   *     check the whole playlist.
   */
  countVideosAddedByUser(username) {
    if (!username) {
      for (let i = 0; i < this.userlist.length; i++) {
        const uids = findVideosAddedByUser(this, this.userlist[i].name);
        this.userlist[i].addedMedia = uids;
      }
      return;
    }
    const pos = findUser(this, username);
    this.userlist[pos].addedMedia = findVideosAddedByUser(this, username);
  }

  /**
   * Sends a newPoll frame to the server.
   *
   * This will create a new poll.
   *
   * Used by $poll.
   *
   * @param {?} poll Poll object.
   */
  createPoll(poll) {
    this.socket.emit('newPoll', poll);
  }

  /**
   * Sends a delete frame to the server.
   *
   * Used by various methods.
   *
   * @param {string} uid The uid of the video to delete.
   */
  deleteVideo(uid) {
    if (typeof uid !== 'undefined') {
      infoLog.log(`!~~~! Sending delete frame for uid: ${uid}`);
      this.socket.emit('delete', uid);
    }
  }

  /**
   * Deletes videos from the database that are like `like`.
   *
   * WARNING - This is experimental!
   *
   * @param {string} like What to match. Example: %skrillex% will delete all
   *     videos with the word "skrillex" in it
   */
  deleteVideosFromDatabase(like) {
    this.db.deleteVideos(like, (num) => {
      this.sendChatMsg(`Deleted: ${num} videos`);
    });
  }

  /**
   * Disallow/un-disallow a user from using the bot.
   *
   * @param {string} user The user to disallow/allow.
   * @param {boolean} disallow true to disallow, false to allow.
   */
  disallowUser(user, disallow) {
    if (typeof user === 'undefined') {
      return;
    }

    user = user.toLowerCase();
    const indexOfUser = this.stats.disallow.lastIndexOf(user);

    if (disallow && indexOfUser === -1) {
      auditLog.log(`!~~~! Disallowing: ${user}`);
      this.stats.disallow.push(user);
    } else if (indexOfUser !== -1 && !disallow) {
      auditLog.log(`!~~~! Allowing: ${user}`);
      this.stats.disallow.splice(indexOfUser, 1);
    }

    this.writePersistentSettings();
  }

  /**
   * Closes a poll.
   *
   * Sends a closePoll frame to the server.
   *
   * Used by $endpoll.
   */
  endPoll() {
    this.socket.emit('closePoll');
  }

  /**
   * Gets the Cytube Socket.io client.
   *
   * @param {string} server The server to connect to.
   * @param {string} room The server to connect to.
   * @return {!Promise<socketIoClient>} The client.
   */
  async getSocketIoClient(server, room) {
    const defaultReg = /(https?:\/\/)?(.*:\d*)/;
    auditLog.log('!~~~! Looking up socketIO info from server');

    const url = await lookupSocketUrl(server, room);
    if (url.match(defaultReg)) {
      return socketIoClient(url);
    } else {
      errorLog.log('!~~~! Error getting socket.io URL');
      process.exit(1);
    }
  }

  /**
   * Gets the stats required for the stats webpage.
   */
  async getStats() {
    return this.db.getStats(this.room);
  }

  /**
   * Grants "automatic" points to users currently in the room.
   *
   * @param {number} activePoints Number of points to grant to active users.
   * @param {number} afkPoints Number of points to grant to AFK users.
   */
  grantAutomaticUserPoints(activePoints = 0, afkPoints = 0) {
    infoLog.log(
        'Granting automatic points ' +
        `(${activePoints} for active users, ${afkPoints} for AFK users)`);

    for (const user of this.userlist) {
      if (user.name === this.username) {
        continue;
      }

      const points = user.meta.afk ? afkPoints : activePoints;
      this.db.updateUserPoints(user.name, points);
    }
  }

  /**
   * Handles queue frames from the server.
   *
   * @param {!QueueEvent} data The queue data.
   */
  async handleAddMedia(data) {
    // See if we should delete this video right away because that user has too
    // many videos
    const pos = findUser(this, data.item.queueby);
    if (typeof pos !== 'undefined') {
      if (this.stats.userLimit && this.userlist[pos].addedMedia.length >= this.stats.userLimitNum) {
        this.sendPm(data.item.queueby, 'You have too many videos on the list');
        this.deleteVideo(data.item.uid);
        return;
      }
      this.userlist[pos].addedMedia.push(data.item.uid);
    }

    if (this.playlist.length === 0) {
      this.playlist = [data.item];
    } else {
      const uid = data.after;
      const index = findIndexOfVideoFromUID(this, uid);
      infoLog.log(`#~~# Adding video after: ${index}`);
      this.playlist.splice(index + 1, 0, data.item);
    }

    if (!(await this.videoIsValid(data.item))) {
      this.deleteVideo(data.item.uid);
    }

    if (!this.stats.managing && data.item.queueby !== this.username) {
      this.moveVideoAboveBotQueuedVideos(data);
    }
  }

  /**
   * Handles addUser frames from the server.
   *
   * @param {?} data addUser data.
   */
  handleAddUser(data) {
    const inList = userInUserlist(this, data.name);
    this.db.insertUser(data.name, data.rank);
    this.db.insertUserRank(data.name, data.rank);
    if (!inList) {
      this.userlist.push(data);
      auditLog.log(`!~~~! Added User: ${data.name}`);
      auditLog.log(`!~~~! Userlist has ${this.userlist.length} users`);
      this.countVideosAddedByUser(data.name);
    }
    this.kickUserIfTimedOut(data.name);
  }

  /**
   * Handles the banlist.
   *
   * If there is a unban function waiting to be executed it executes it
   *
   * @param {!Array<BannedUser>} data The banlist.
   */
  handleBanlist(data) {
    this.banlist = data;
    loopThroughWaiting(this, 'unban');
  }

  /**
   * Handles changeMedia frames from the server.
   *
   * If the bot is managing the playlist and the last video was not temporary it
   * sends a delete frame.
   *
   * @param {?} data changeMedia data.
   */
  handleChangeMedia(data) {
    if (this.stats.managing && this.loggedIn && !this.firstChangeMedia &&
        this.playlist.length !== 0) {
      let temp = true;
      const uid = this.previousUID;

      // Try our best to find out if the video is temp
      // If we get an exception it's because the media was deleted
      try {
        if (typeof uid !== 'undefined') {
          temp = getVideoFromUID(this, uid).temp;
        }
      } catch (e) {
        infoLog.log('!~~~! Media deleted. handleChangeMedia lookup temp failed');
      }

      if (typeof uid !== 'undefined' && !temp) {
        this.deleteVideo(uid);
      }
    }
    this.currentMedia = data;
    this.firstChangeMedia = false;
    infoLog.log(`#~~# Current Video now ${this.currentMedia.title}`);
  }

  /**
   * Handles chatMsg frames from the server.
   *
   * If the first character of the msg is $, we interpret it as a command.
   *
   * We ignore chats from before the bot was started, in order to avoid old
   * commands.
   *
   * @param {?} data Message data.
   * @param {boolean} isPm Whether the message is a PM.
   */
  handleChatMsg(data, isPm) {
    const username = data.username;
    let msg = data.msg;
    const time = data.time;
    const smuted = data.meta.shadow;

    infoLog.log(`!~~~! Chat Message: ${username}: ${msg}`);

    // Ignore server messages
    if (username === '[server]') {
      return;
    }

    // Filter the message
    msg = filterMsg(msg);
    if (!msg) {
      return;
    }

    // Avoid old messages
    if (time < this.startTime) {
      return;
    }

    const allowed = !this.stats.disallow.includes(username);
    if (!allowed) {
      this.sendPm(username, `You're not allowed to use the bot`);
    }

    const handleCommand = msg.startsWith('$') &&
        (username.toLowerCase() !== this.username.toLowerCase()) && this.loggedIn && allowed &&
        !smuted;

    if (handleCommand) {
      handleChatMessage(this, username, msg);
      return;
    }

    if (!isPm) {
      this.recordEmoteCombo(username, msg);
      this.db.insertChat(msg, time, username, this.room);
    }
  }

  /**
   * Handles channelOpts from the server
   *
   * @param {?} data Channel Settings data
   * @param {boolean} chat_antiflood If chat throttle is on
   * @param {int} chat_antiflood_params.burst Burst before throttle
   * @param {int} chat_antiflood_params.sustained Messages per second after burst
   * @param {int} maxlength Max video length
   * @param {int} playlist_max_duration_per_user Max combined video duration per user
   *
   */
  handleChannelOpts(data) {
    const isThrottled = data.chat_antiflood;
    const burstBeforeThrottle = data.chat_antiflood_params.burst;
    const msgAfterBurst = data.chat_antiflood_params.sustained;
    const maxLength = data.maxlength;
    const maxDurationPerUser = data.playlist_max_duration_per_user;

    infoLog.log(`Channel Settings Updated:`);
    infoLog.log(`Throttle chat = ${isThrottled}`);
    infoLog.log(`Burst before throttling = ${burstBeforeThrottle}`);
    infoLog.log(`Msg after burst per second = ${msgAfterBurst}`);
    infoLog.log(`Max video length = ${maxLength}`);
    infoLog.log(`Max combined video duration per user = ${maxDurationPerUser}`);
  }

  /**
   * Sets slowmode
   *
   * @param {int} isThrottled Int for slowmode on, off, or reg
   *
   */
  setSlowmode(isThrottled) {
    if (isThrottled === 1) {
      this.socket.emit('setOptions', {
        chat_antiflood: true,
        maxlength: 600,
        new_user_chat_link_delay: 900,
        playlist_max_duration_per_user: 1800,
      });
    } else if (isThrottled === 2) {
      this.socket.emit('setOptions', {
        chat_antiflood: false,
        maxlength: 3600,
        new_user_chat_link_delay: 600,
        playlist_max_duration_per_user: 7200,
      });
    } else if (isThrottled === 3) {
      this.socket.emit('setOptions', {
        chat_antiflood: true,
        maxlength: 3600,
        new_user_chat_link_delay: 600,
        playlist_max_duration_per_user: 7200,
      });
    } else {
      this.sendChatMsg('Failed to set slowmode. FeelsBadMan');
    }
    infoLog.log(`Throttle: ${isThrottled}`);
  }

  /**
   * Adds emote
   *
   * @param {string} eName Name of emote to add
   * @param {string} eLink Link for emote image
   */
  addEmote(eName, eLink) {
    this.socket.emit('updateEmote', {
      name: eName,
      image: eLink,
    });
  }

  /**
   * Removes an emote
   *
   * @param {string} eToRemove
   *
   */
  removeEmote(eToRemove) {
    this.socket.emit('removeEmote', {
      name: eToRemove,
    });
  }

  /**
   * Handles delete frames from the server.
   *
   * If there are no more videos in the playlist and we are managing, add a
   * random video.
   *
   * @param {?} data Delete data.
   */
  handleDeleteMedia(data) {
    const uid = data.uid;
    const index = findIndexOfVideoFromUID(this, uid);

    if (typeof index !== 'undefined') {
      infoLog.log(`#~~~# Deleting media at index: ${index}`);

      const addedBy = getVideoFromUID(this, uid).queueby;
      const pos = findUser(this, addedBy);

      if (typeof pos !== 'undefined') {
        // Remove the media from the user's addedMedia
        this.userlist[pos].addedMedia.splice(this.userlist[pos].addedMedia.indexOf(uid), 1);
      }

      this.playlist.splice(index, 1);
      if (this.playlist.length === 0 && this.stats.managing) {
        this.addRandomVideos();
      }
    }
  }

  /**
   * Handles changes to the channel emote list.
   *
   * @param {!Emote} emote The emote object that has changed.
   */
  handleEmoteUpdate(emote) {
    if (!this.enableWebServer) {
      return;
    }

    for (let i = 0; i < this.channelEmotes.length; i++) {
      if (this.channelEmotes[i].name === emote.name) {
        this.channelEmotes[i] = emote;
        return;
      }
    }

    this.channelEmotes.push(emote);
  }

  /**
   * Handles a change in hybridMods or calls sendHybridModPermissions if no
   * permission is given.
   *
   * Used by $permissions.
   *
   * @param {string=} permission The permission we are changing, or undefined if
   *     there is none.
   * @param {string} name name of the user we want to change permissions for, or
   *     look up.
   */
  handleHybridModPermissionChange(permission, name) {
    const permData = {
      permission: permission,
      name: name,
    };

    perms.handleHybridModPermissionChange(this, permData);
  }

  /**
   *
   *
   * @return {Array} to save as array 'timers'
   */
  async readTimerPhrases() {
    try {
      const tmrText = readFile('./timers.txt', 'utf-8');
      const timers = (await tmrText).split('\n');
      // this.sendChatMsg(`Test readTimerPhrases: ${timers}`);
      return timers;
    } catch (err) {
      this.sendChatMsg(`ERROR readTimerPhrases(): ${err}`);
    }
  }

  /**
   *
   *
   * @return {Array} to save as array 'timerEnds'
   */
  async readTimerEnds() {
    try {
      const tmrText = readFile('./tEnds.txt', 'utf-8');
      const timerEnds = (await tmrText).split('\n');
      // this.sendChatMsg(`Test readTimerEnds: ${timerEnds}`);
      return timerEnds;
    } catch (err) {
      this.sendChatMsg(`ERROR readTimerEnds(): ${err}`);
    }
  }

  /**
   *
   *
   * @return {Array} to save as array 'timerStarts
   */
  async readTimerStarts() {
    try {
      const tmrText = readFile('./tStarts.txt', 'utf-8');
      const timerStarts = (await tmrText).split('\n');
      // this.sendChatMsg(`Test readTimerStarts: ${timerStarts}`);
      return timerStarts;
    } catch (err) {
      this.sendChatMsg(`ERROR readTimerStarts(): ${err}`);
    }
  }

  /**
   *
   *
   * @param {Array} tPhrases to write from array 'timers'
   */
  async writeTimerPhrases(tPhrases) {
    try {
      // this.sendChatMsg(`ph: ${tPhrases}`);
      const tPhrasesFormat = tPhrases.join('\n');
      writeFile('./timers.txt', `${tPhrasesFormat}`);
      // this.sendChatMsg(`Test writeTimerPhrases success!`);
    } catch (err) {
      this.sendChatMsg(`ERROR writeTimerPhrases(): ${err}`);
    }
  }

  /**
   *
   *
   * @param {Array} tEnds to write from array 'timerEnds'
   */
  async writeTimerEnds(tEnds) {
    try {
      // this.sendChatMsg(`ph: ${tEnds}`);
      const tEndsFormat = tEnds.join('\n');
      writeFile('./tEnds.txt', `${tEndsFormat}`);
      // this.sendChatMsg(`Test writeTimerEnds success!`);
    } catch (err) {
      this.sendChatMsg(`ERROR writeTimerEnds(): ${err}`);
    }
  }

  /**
   *
   *
   * @param {Array} tStarts to write from array 'timerStarts'
   */
  async writeTimerStarts(tStarts) {
    try {
      // this.sendChatMsg(`ph: ${tStarts}`);
      const tStartsFormat = tStarts.join('\n');
      writeFile('./tStarts.txt', `${tStartsFormat}`);
      // this.sendChatMsg(`Test writeTimerStarts success!`);
    } catch (err) {
      this.sendChatMsg(`ERROR writeTimerStarts(): ${err}`);
    }
  }

  /**
   * An individual async timer meant for timers from before a bot restart.
   *
   * @param {string} timerTxt Timer message.
   * @param {int} timeLeft Timer duration left.
   * @param {?} totalTime Total timer duration (needed for timer msg).
   */
  async createTimer(timerTxt, timeLeft, totalTime) {
    await sleep(timeLeft);
    this.sendChatMsg(`[red][TIMER: ${totalTime}][/]: ${timerTxt}`);
  }

  /**
   * Handles any timers saved after restart.
   *
   *
   */
  async handleTimersPostRestart() {
    try {
      const tPhr = await this.readTimerPhrases();
      const tEn = await this.readTimerEnds();
      const tStart = await this.readTimerStarts();
      await sleep(3000);
      const tPhrase = tPhr;
      const tEnd = tEn;
      const tStarts = tStart;
      if (tEnd === null) {
        this.sendChatMsg(`no timers test`);
        return;
      }
      for (let i = 0; i < tEnd.length; i++) {
        if ((getCurrentUnixTimestamp() > tEnd[i]) && (tEnd[i] !== 0) || (tEnd[i] === null)) {
          this.sendChatMsg(
              `[red]Timer Expired during downtime[/]: ` +
              `${humanizeDuration((getCurrentUnixTimestamp() - tEnd[i]) * 1000)} ago.` +
              `%^^%Msg: ${tPhrase[i]}`);
          const indexTmsg = tPhrase.indexOf(tPhrase[i]);
          tPhrase.splice(indexTmsg, 1);
          const indexTend = tEnd.indexOf(tEnd[i]);
          tEnd.splice(indexTend, 1);
          const indexTstart = tStarts.indexOf(tStarts[i]);
          tStarts.splice(indexTstart, 1);
          this.writeTimerPhrases(tPhrase);
          this.writeTimerEnds(tEnd);
          this.writeTimerStarts(tStarts);
        } else {
          const timeLeftMs = ((tEnd[i] - getCurrentUnixTimestamp()) * 1000);
          const totalTime = humanizeDuration((tEnd[i] - tStarts[i]) * 1000);
          this.createTimer(tPhrase[i], timeLeftMs, totalTime);
          // this.sendChatMsg(`handleTimersPostRestart() end`);
        }
      }
    } catch (err) {
      this.sendChatMsg(`handleTimersPostRestart ERROR: ${err}`);
    }
  }

  /**
   * Handles login frame from the server.
   *
   * @param {?} data The login data.
   */
  async handleLogin(data) {
    if (!data.success) {
      auditLog.log('!~~~! Failed to login');
      return;
    }

    this.sendChatMsg(
        'Bot starting up, please wait... MrDestructoid',
        /** override=*/ true);

    // Be sure we have the correct capitalization - some cytube functions
    // require it.
    this.username = data.name;
    this.socket.emit('requestPlaylist');

    auditLog.log('!~~~! Now handling commands');
    this.loggedIn = true;
    this.sendChatMsg(`Now handling commands. Times restarted: ${await this.readTimes()}`);
    // add call for timer stuff here
    this.handleTimersPostRestart();
  }

  /**
   * Handles mediaUpdate frames from the server.
   *
   * If we are managing and the playlist only has one item and the video is
   * about to end, we add a random video.
   *
   * @param {?} data The data.
   */
  handleMediaUpdate(data) {
    // console.log(`#~~~# Current video time: ${data.currentTime} Paused: ${data.paused}`);
    // ^ Disabled for now.

    this.leaderData.currentTime = data.currentTime;
    this.leaderData.paused = data.paused;

    const lessThanSixSecondsRemaining = (this.currentMedia.seconds - data.currentTime) < 6;
    const playlistHasOneItem = this.playlist.length === 1;
    const shouldAddRandomVideos =
        lessThanSixSecondsRemaining && playlistHasOneItem && this.stats.managing;

    if (shouldAddRandomVideos) {
      this.addRandomVideos();
    }
  }

  /**
   * Handles moveVideo frames from the server.
   *
   * @param {?} data moveMedia data.
   */
  handleMoveMedia(data) {
    const {from, after} = data;
    const fromIndex = findIndexOfVideoFromUID(this, from);

    // Remove video.
    const removedVideo = this.playlist.splice(fromIndex, 1);
    const afterIndex = findIndexOfVideoFromUID(this, after);

    // And add it in the new position.
    this.playlist.splice(afterIndex + 1, 0, removedVideo[0]);
    infoLog.log(`#~~~# Moving video from: ${fromIndex} after ${afterIndex}`);
  }

  /**
   * Handles needPassword frames from the server.
   *
   * needPasswords are sent when the room we are trying to join has a password.
   */
  handleNeedPassword() {
    if (this.roomPassword) {
      infoLog.log('!~~~! Room has password; sending password');
      this.socket.emit('channelPassword', this.roomPassword);
      this.roomPassword = null;
    } else {
      infoLog.log(
          '\n!~~~! No room password in config.json or password is wrong. ' +
          'Killing bot!\n');
      process.exit(1);
    }
  }

  /**
   * Handles playlist frames from the server and validates the videos.
   *
   * @param {!Array<!Video>} playlist Playlist data.
   */
  async handlePlaylist(playlist) {
    for (let i = 0; i < this.userlist.length; i++) {
      this.userlist[i].addedMedia = [];
    }

    this.playlist = playlist;
    this.countVideosAddedByUser();
    if (this.playlist.length === 0 && this.stats.managing) {
      this.addRandomVideos();
    }

    for (const video of playlist) {
      if (!(await this.videoIsValid(video))) {
        this.deleteVideo(video.uid);
      }
    }
  }

  /**
   * Handles a removeEmote frame.
   *
   * @param {!Emote} emote The emote to be removed.
   */
  handleRemoveEmote(emote) {
    if (!this.enableWebServer) {
      return;
    }

    let index = -1;

    for (let i = 0; i < this.channelEmotes.length; i++) {
      if (this.channelEmotes[i].name === emote.name) {
        index = i;
        break;
      }
    }

    if (index !== -1) {
      this.channelEmotes.splice(index, 1);
    }
  }

  /**
   * Handles setCurrent frames from the server.
   *
   * This is a better way of handling the current media UID problem.
   *
   * @param {string} uid UID of the current video.
   */
  handleSetCurrent(uid) {
    if (this.currentUID === null) {
      this.currentUID = uid;
      this.previousUID = uid;
    } else {
      this.previousUID = this.currentUID;
      this.currentUID = uid;
    }
  }

  // Handles the setLeader frame
  // If it says we are leader, change isLeader
  // name - The name of the leader
  handleSetLeader(name) {
    if (name.toLowerCase() === this.username.toLowerCase()) {
      this.isLeader = true;
      loopThroughWaiting(this, 'settime');
    } else {
      this.isLeader = false;
    }
  }

  /**
   * Handles setTemp frames from the server.
   *
   * @param {?} data setTemp data.
   */
  handleSetTemp(data) {
    const temp = data.temp;
    const uid = data.uid;

    const index = findIndexOfVideoFromUID(this, uid);

    if (typeof index === 'undefined') {
      auditLog.log('Error: handleSetTemp.index undefined.');
      return;
    }

    infoLog.log(`#~~~# Setting temp: ${temp} on video at index ${index}`);
    this.playlist[index].temp = temp;
  }

  /**
   * Handles setUserMeta frames from the server.
   *
   * @param {SetUserMetaEvent} event setUserMeta event.
   */
  handleSetUserMeta(event) {
    const user = this.userlist.filter((user) => user.name === event.name)[0];
    user.meta.afk = event.meta.afk;
    user.meta.muted = event.meta.muted;
    user.meta.smuted = event.meta.smuted;
    if ((user.name === this.username) && (event.meta.afk === true)) {
      this.sendChatMsg('/afk');
      infoLog.log(`%xxx% Bot AFK: false`);
    }
  }

  /**
   * Handles setUserRank frames from the server.
   *
   * @param {?} data setUserRank data.
   */
  handleSetUserRank(data) {
    for (let i = 0; i < this.userlist.length; i++) {
      if (this.userlist[i].name.toLowerCase() === data.name.toLowerCase()) {
        this.userlist[i].rank = data.rank;
        this.db.insertUserRank(data.name, data.rank);
        infoLog.log(`!~~~! Setting rank: ${data.rank} on ${data.name}`);
        break;
      }
    }
  }

  /**
   * Handles userLeave frames from the server.
   *
   * @param {?} user userLeave data.
   */
  handleUserLeave(user) {
    const index = findUser(this, user);
    if (typeof index !== 'undefined') {
      this.userlist.splice(index, 1);
      auditLog.log(`!~~~! Removed user: ${user}`);
      auditLog.log(`!~~~! Userlist has : ${this.userlist.length} users`);
    }
  }

  /**
   * Handles userlist frames from the server.
   *
   * @param {?} data userlist data.
   */
  handleUserlist(data) {
    this.userlist = data;
    this.countVideosAddedByUser();

    for (const user of this.userlist) {
      this.db.insertUser(user.name, user.rank);
      this.db.insertUserRank(user.name, user.rank);
    }
  }

  /**
   * Kicks a user if they are timed out.
   *
   * @param {string} user The user to kick.
   */
  async kickUserIfTimedOut(user) {
    const timedOutUntilUnix = await this.db.getUserTempBanEnd(user);

    const currentTimeUnix = getCurrentUnixTimestamp();

    if (timedOutUntilUnix <= currentTimeUnix) {
      // Not currently timed out.
      return;
    }

    const remainingMs = (timedOutUntilUnix - currentTimeUnix) * 1000;
    const remaining = humanizeDuration(remainingMs);

    infoLog.log(`Kicking ${user} as they are timed out for another ${remaining}`);
    this.sendPm(user, `You are timed out from ${this.room} for another ${remaining}`);
    this.sendChatMsg(`/kick ${user}`, true);
  }

  /** Lists blacklisted users. */
  async listBlacklistedUsers() {
    const users = await this.db.getAllBlacklistedUsers();
    const blocked = users.length > 0 ? users.join(', ') : 'None';
    this.sendChatMsg(`Blacklisted: ${blocked}`);
  }

  /** Lists blocked users. */
  async listBlockedUsers() {
    const users = await this.db.getAllBlockedUsers();
    const blocked = users.length > 0 ? users.join(', ') : 'None';
    this.sendChatMsg(`Blocked: ${blocked}`);
  }

  /**
   * Moves a new video above the bot-queued videos.
   *
   * @param {!QueueEvent} video The queue data.
   */
  moveVideoAboveBotQueuedVideos(video) {
    if (this.playlist.map((playlistVideo) => playlistVideo.media.id)
            .indexOf(video.item.media.id) !== this.playlist.length - 1) {
      // Wasn't added as the last video. Ignore.
      return;
    }
    if (this.playlist.length <= 2) {
      return;
    }

    const videoToQueueAfter = (() => {
      let foundBotVideo = false;
      for (let i = this.playlist.length - 1; i >= 0; i--) {
        const video = this.playlist[i];

        if (!foundBotVideo && video.queueby === this.username) {
          foundBotVideo = true;
          continue;
        }

        // First non-bot video before the block of bot videos
        if (foundBotVideo && video.queueby !== this.username) {
          return video;
        }

        // No non-bot videos found. Add after the first video.
        if (i === 0 && foundBotVideo) {
          return video;
        }
      }
    })();
    if (!videoToQueueAfter) {
      return;
    }

    this.sendMoveMedia(video.item.uid, videoToQueueAfter.uid);
  }

  /**
   * Reads the persistent settings or has the callback write the defaults.
   *
   * @return {!Promise<boolean>} Whether the persistent settings exist.
   */
  async readPersistentSettings() {
    try {
      const data = await readFile('persistent.json');
      this.stats = JSON.parse(data);
      auditLog.log('!~~~! Read persistent settings');
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * Reads the number of times the bot has been restarted.
   *
   * @return {!Promise<string>} Number of times the bot has been restarted.
   */
  async readTimes() {
    try {
      return readFile(RESTART_TIMES_FILE_NAME);
    } catch (e) {
      errorLog.log('Error reading times');
      return null;
    }
  }

  /**
   * For each message, keep track of emote combos.
   *
   * @param {string} username Username of the chat message's author.
   * @param {string} msg Message to be recorded.
   */
  recordEmoteCombo(username, msg) {
    const emoteNames = this.channelEmotes.map((emote) => emote.name);
    const words = msg.split(' ');

    for (const [emoteName, count] of this.emoteCombos.entries()) {
      if (count < 5) {
        continue;
      }
      if (!words.includes(emoteName)) {
        this.sendChatMsg(`${count}x ${emoteName} combo!`);
        this.emoteCombos.clear();
        break;
      }
    }

    for (const emoteName of this.emoteCombos.keys()) {
      if (!words.includes(emoteName)) {
        this.emoteCombos.delete(emoteName);
      }
    }

    for (const word of new Set(words)) {
      if (username === this.username) {
        // Don't count bot messages in emote combos.
        break;
      }

      if (!emoteNames.includes(word)) {
        continue;
      }

      const currentCount = this.emoteCombos.has(word) ? this.emoteCombos.get(word) : 0;
      this.emoteCombos.set(word, currentCount + 1);
    }
  }

  /**
   * Sends an assignLeader frame to the server.
   *
   * @param {string} user Name of the user we're setting leader.
   * @return {boolean} whether the assignment succeeded.
   */
  sendAssignLeader(user) {
    let rank = 0;
    try {
      rank = getUser(this, this.username).rank;
    } catch (e) {
      // Not in list.
    }

    // Sending assignLeader if not mod results in being kicked.
    if (rank < 2) {
      return false;
    }

    infoLog.log(`!~~~! Assigning leader to: ${user}`);
    this.socket.emit('assignLeader', {name: user});
    return true;
  }

  /**
   * Sends a chatMsg frame to the server.
   *
   * If we are using modflair it will try and send meta for it.
   *
   * @param {string} message Message to be sent.
   * @param {boolean} override Whether we should override safety checks.
   */
  sendChatMsg(message, override) {
    // Rank is used to send the modflair.
    let rank = 0;

    // If we're muted or not done initializing, there's no point in continuing.
    if ((this.stats.muted && !override) || (!this.loggedIn && !override)) {
      return;
    }

    infoLog.log(`!~~~! Sending chatMsg: ${message}`);
    rank = getUser(this, this.username.toLowerCase());
    if (typeof rank !== 'undefined') {
      rank = rank.rank;
    }

    const meta = this.flair ? {modflair: rank} : {};
    this.socket.emit('chatMsg', {
      msg: message,
      meta: meta,
    });
  }

  /**
   * Sends the hybridmod permissions for `name`.
   *
   * @param {string} name Name to send hybridmod permissions for.
   */
  sendHybridModPermissions(name) {
    if (name) {
      this.sendChatMsg(`${name}: ${this.stats.hybridMods[name]}`);
    }
  }

  /**
   * Sends a mediaUpdate frame.
   *
   * @param {number} time The time the video is at, or the time we want to set.
   * @param {boolean} paused Whether we should pause the video.
   */
  sendMediaUpdate(time, paused) {
    if (typeof time !== 'number' || typeof paused === 'undefined') {
      return;
    } else if (!this.isLeader || !this.currentMedia) {
      return;
    }

    infoLog.log(`!~~~! Setting time on video to: ${time} Paused: ${paused}`);

    this.socket.emit('mediaUpdate', {
      id: this.currentMedia.id,
      currentTime: time,
      paused: paused,
      type: this.currentMedia.type,
    });
  }

  /**
   * Sends a moveMedia frame to the server.
   *
   * Used by $bump.
   *
   * @param {number} from The index of the video to move.
   * @param {number=} after The video index to move the video after.
   */
  sendMoveMedia(from, after) {
    if (typeof from === 'undefined') {
      return;
    }
    const afterId = typeof after === 'undefined' ? this.currentUID : after;
    infoLog.log(`!~~~! Sending moveMedia frame for uid: ${from}`);
    console.log(`moveMedia=${JSON.stringify({from: from, after: afterId})}`);
    this.socket.emit('moveMedia', {
      from: from,
      after: afterId,
    });
  }

  /**
   * Sends a private message.
   *
   * @param {string} to The person we wish to send the message to.
   * @param {string} msg The message.
   */
  sendPm(to, msg) {
    if (!to) {
      return;
    }

    this.socket.emit('pm', {
      to: to,
      msg: msg,
      meta: {},
    });
  }

  /**
   * Sends an unban frame to the server.
   *
   * @param {{id: string, name: string}} json Unban data: {id: banId, name:
   *     username}
   */
  sendUnban(json) {
    infoLog.log(`!~~~! Sending unban for: ${JSON.stringify(json)}`);
    this.socket.emit('unban', json);
  }

  /**
   * Emits a shufflePlaylist frame.
   *
   * Used by $shuffle.
   */
  shufflePlaylist() {
    this.socket.emit('shufflePlaylist');
  }

  /**
   * Used to start the process of joining a channel.
   *
   * Called after we have initialized the bot and set socket listeners
   */
  start() {
    auditLog.log('Starting bot');
    this.socket.emit('initChannelCallbacks');
    this.socket.emit('joinChannel', {name: this.room});
    this.socket.emit('login', {
      name: this.username,
      pw: this.pw,
    });

    const automaticPointsIntervalMins = 10;
    const automaticActivePoints = 10;
    const automaticAfkPoints = 3;

    setInterval(
        () => this.grantAutomaticUserPoints(automaticActivePoints, automaticAfkPoints),
        automaticPointsIntervalMins * 60 * 1000);
  }

  /**
   * If the playlist is empty for a while, queue some random songs.
   */
  startAutoQueueing() {
    const timeBeforeQueueing = Duration.fromObject({minutes: 1});
    const videosToQueue = 5;

    let /** @type {DateTime|null} */ playlistEmptySince = null;

    const checkIntervalSeconds = 2;
    setInterval(async () => {
      if (this.playlist.length > 0) {
        // Queue not empty.
        playlistEmptySince = null;
        return;
      }
      if (!playlistEmptySince) {
        // Queue JUST became empty. Start the timer.
        playlistEmptySince = DateTime.now();
        return;
      }

      // Queue is already empty. If enough time has passed, add some videos.
      if (DateTime.now() >= playlistEmptySince.plus(timeBeforeQueueing)) {
        await this.addRandomVideos(videosToQueue);
        playlistEmptySince = null;
      }
    }, checkIntervalSeconds * 1000);
  }

  /**
   * Monitor Twitch channels for their live status.
   */
  startMonitoringTwitchChannels() {
    const checkIntervalSeconds = 5;
    setInterval(async () => {
      /** @type {!Map<string, boolean|null>} */
      let channels;
      try {
        channels = await this.twitch.areUsersLive(
            this.monitoredTwitchChannels.map((channel) => channel.name));
      } catch (err) {
        // Usually a transient Twitch API failure. They happen from time to time. Log and ignore.
        errorLog.log(err);
        return;
      }

      for (const channel of this.monitoredTwitchChannels) {
        const live = channels.get(channel.name);
        if (live === null) {
          errorLog.log(
              `Couldn't determine if Twitch channel ${channel.name} is live. Does it exist?`);
          continue;
        }

        // Wasn't live. Now is.
        if (live && !channel.live) {
          this.sendChatMsg(`/say ${channel.name} is now live! https://twitch.tv/${channel.name}`);
        }

        channel.live = live;
      }
    }, checkIntervalSeconds * 1000);
  }

  /**
   * Ensure no tempbanned users are in the room. If they are, kick them.
   */
  startReconcilingTempbans() {
    const checkIntervalSeconds = 10;
    setInterval(async () => {
      const tempbans = (await this.db.getAllTempBans()).map((tempban) => tempban.name);
      const usersToKick =
          this.userlist.filter((user) => tempbans.includes(user.name)).map((user) => user.name);

      if (usersToKick.length > 0) {
        infoLog.log(`Users are not timed out, unmuting: ${usersToKick}`);

        for (const user of usersToKick) {
          this.sendChatMsg(`/kick ${user}`, true);
        }
      }
    }, checkIntervalSeconds * 1000);
  }

  /**
   * Ensure the list of users currently muted matches the timed out users.
   *
   * If users are muted but shouldn't be, unmute them.
   * If users are unmuted but should be, mute them.
   */
  startReconcilingTimeouts() {
    const checkIntervalSeconds = 10;
    setInterval(async () => {
      const timeouts = await this.db.getAllTimeouts();
      const timedOutUsers = timeouts.map((timeout) => timeout.name);

      {
        const usersToUnmute = this.userlist
                                  .filter(
                                      (user) => (user.meta.muted && !user.meta.smuted) &&
                                          !timedOutUsers.includes(user.name))
                                  .map((user) => user.name);
        if (usersToUnmute.length > 0) {
          infoLog.log(`Users are not timed out, unmuting: ${usersToUnmute}`);

          for (const user of usersToUnmute) {
            this.sendChatMsg(`/unmute ${user}`, true);
          }
        }
      }

      {
        const usersToMute =
            this.userlist.filter((user) => !user.meta.muted && timedOutUsers.includes(user.name))
                .map((user) => user.name);
        if (usersToMute.length > 0) {
          infoLog.log(`Users are timed out, muting: ${usersToMute}`);

          for (const user of usersToMute) {
            this.sendChatMsg(`/mute ${user}`, true);
          }
        }
      }
    }, checkIntervalSeconds * 1000);
  }

  /**
   * Inserts the usercount into the database.
   *
   * @param {number} count The number of users.
   */
  storeUsercount(count) {
    this.db.insertUsercount(count, new Date().getTime());
  }

  /** Turns off log writing. */
  turnOffLogging() {
    errorLog.enabled = false;
    infoLog.enabled = false;
    auditLog.enabled = false;
    errorLog.close();
    infoLog.close();
    auditLog.close();
  }

  /**
   * Validates a given video to ensure that it hasn't been blocked or that it
   * can be played in the country specified in `deleteIfBlockedIn` (if given).
   *
   * Optionally uses youtube look up if we have the apikey.
   *
   * @param {!Video} video The video we want to validate.
   * @return {!Promise<boolean>} Whether the video is valid.
   */
  async videoIsValid(video) {
    const {type, id, title, seconds: dur} = video.media;
    const nick = video.queueby;
    const uid = video.uid;
    let rank = 0;

    try {
      rank = getUser(this, nick).rank;
    } catch (e) {
    }

    if (nick.toLowerCase() !== this.username.toLowerCase()) {
      this.db.insertVideo(type, id, title, dur, nick);
    }

    const flags = await this.db.getVideoFlag(type, id);
    if (flags === 2 && rank < 2) {
      this.sendPm(nick, `Video blocked: ${title}`);
      return true;
    }

    const block = await this.checkUserBlock(nick);
    if (block) {
      this.db.flagVideo(type, id, 1, title);
      this.sendPm(nick, `You're blocked from adding videos.`);
      return true;
    }

    if (type === 'yt' && this.youtubeApiKey) {
      const {valid, invalidReason} = await validateYouTubeVideo(this, id, type, title);
      if (valid) {
        return true;
      }

      if (await this.userIsBlacklisted(nick)) {
        this.blacklistVideo(uid);
      }

      switch (invalidReason) {
        case 'disabled':
          auditLog.log(`!~~! Emedding disabled: ${id}`);
          this.sendPm(nick, `Embedding disabled: ${id}`);
          break;

        case 'blocked':
          auditLog.log(`!~~~! Video blocked in: ${this.deleteIfBlockedIn}`);
          this.sendPm(nick, `Video blocked in: ${this.deleteIfBlockedIn}. id: ${id}`);
          break;

        case 'invalid':
          auditLog.log(`!~~~! Invalid video: ${id}`);
          this.sendPm(nick, `Invalid video: ${id}`);
          break;

        default:
          auditLog.log(`!~~~! Invalid (unknown) video: ${id}`);
          this.sendPm(nick, `Error: Video might not play. Deleting: ${id}`);
          break;
      }

      return false;
    } else if (await this.userIsBlacklisted(nick)) {
      this.blacklistVideo(uid);
    }

    return true;
  }

  /**
   * Updates the persistent settings.
   */
  updatePersistentSettings() {
    let changed = false;
    if (!this.stats.hybridMods) {
      changed = true;
      this.stats.hybridMods = {};
    }
    if (typeof this.stats.userLimit === 'undefined') {
      changed = true;
      this.stats.userLimit = false;
      this.stats.userLimitNum = 10;
    }
    if (typeof this.stats.disallow === 'undefined') {
      changed = true;
      this.stats.disallow = {};
    }

    if (Object.prototype.toString.call(this.stats.disallow) === '[object Object]') {
      const tempDisallow = [];
      for (const key in this.stats.disallow) {
        if (this.stats.disallow.hasOwnProperty(key)) {
          tempDisallow.push(key);
        }
      }
      this.stats.disallow = tempDisallow;
      changed = true;
    }

    if (changed) {
      this.writePersistentSettings();
    }
  }

  /**
   * Writes the persistent settings.
   *
   * Used by various methods.
   */
  async writePersistentSettings() {
    auditLog.log('!~~~! Writing persistent settings');
    const stringyJSON = JSON.stringify(this.stats);
    try {
      await writeFile('persistent.json', stringyJSON);
    } catch (e) {
      errorLog.log(e);
      process.exit(1);
    }
  }
}
