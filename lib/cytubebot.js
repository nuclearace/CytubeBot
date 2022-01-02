import Cleverbot from 'cleverbot-node';
import {readFile, writeFile} from 'fs';
import {RateLimiter, TokenBucket} from 'limiter';
import socketIoClient from 'socket.io-client';

import {socketLookup} from './apiclient.js';
import {addHandlers} from './bothandlers.js';
import {handle as chatHandle} from './chatcommands.js';
import {Database} from './database.js';
import {IOServer} from './ioserver.js';
import {IRCClient} from './ircclient.js';
import {cytubelog, errlog, syslog} from './logger.js';
import * as perms from './permissions.js';
import {filterMsg, findIndexOfVideoFromUID, findUser, findVideosAddedByUser, getUser, getVideoFromUID, loopThroughWaiting, userInUserlist} from './utils.js';
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

export class CytubeBot {
  constructor(config) {
    syslog.log('Setting up bot');

    // Begin config things

    // Cytube user info
    this.cytubeServer = config.cytubeServer;
    this.flair = config.usemodflair;
    this.pw = config.pw;
    this.room = config.room;
    this.roomPassword = config.roompassword;
    this.username = config.username;
    this.maxVideoLength = config.maxvideolength;

    this.useLogger = config.enableLogging;
    if (!this.useLogger) {
      this.turnOffLogging();
    }

    // APIs
    this.mstranslateclient = config.mstranslateclient;
    this.mstranslatesecret = config.mstranslatesecret;
    this.weatherunderground = config.weatherunderground;
    this.wolfram = config.wolfram;
    if (this.wolfram) {
      this.wolfram = this.wolfram.toLowerCase();
    }
    this.youtubeapi = config.youtubev3;
    this.deleteIfBlockedIn = config.deleteIfBlockedIn;
    if (this.deleteIfBlockedIn) {
      this.deleteIfBlockedIn = this.deleteIfBlockedIn.toUpperCase();
    }

    this.enableWebServer = config.enableWebServer;
    this.socketPort = config.socketPort;
    this.webURL = config.webURL;
    this.webPort = config.webPort;

    this.irc = {};
    this.useIRC = config.useIRC;
    this.ircServer = config.ircServer;
    this.ircChannel = config.ircChannel;
    this.ircNick = config.ircNick;
    this.ircPass = config.ircPass;

    // Cleverbot.
    this.talkBot = null;

    // End config things.

    // Channel data.
    this.userlist = [];
    this.playlist = [];
    this.previousUID = null;
    this.currentUID = null;
    this.currentMedia = {};
    this.leaderData = {currentTime: 0, paused: false};
    this.firstChangeMedia = true;

    /** @type {!Array<!Emote>} */
    this.channelEmotes = [];
    this.banlist = [];

    // Cooldown times / rate limiters

    // 10 requests per min is the limit for weatherunderground.
    this.weatherLimiter = new RateLimiter(10, 'minute');
    this.addVideoLimiter = new TokenBucket(3, 1, 'second', null);
    this.wolframLimiter = new RateLimiter(65, 'day');
    this.talkLimiter = new RateLimiter(1000, 'day');
    this.videoLookupLimiter = new RateLimiter(10, 'second');
    this.timeSinceLastTalk = 0;
    this.timeSinceLastAnagram = 0;
    this.timeSinceLastTranslate = 0;
    this.timeSinceLastStatus = 0;

    // Bot data
    this.socket;
    this.getSocketURL(this.cytubeServer);
    this.startTime = new Date().getTime();
    this.db = new Database(this.maxVideoLength);
    this.isLeader = false;
    this.loggedIn = false;
    this.waitingFunctions = [];
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

    this.talkBot = new Cleverbot;

    this.readPersistentSettings((err) => {
      if (err) {
        this.writePersistentSettings();
      }

      this.updatePersistentSettings();
    });

    if (this.enableWebServer) {
      this.server = new Server(this);
      this.ioServer = new IOServer(this.socketPort, this);
    }

    if (this.useIRC) {
      if (this.ircChannel.indexOf('#') !== 0) {
        this.ircChannel = '#' + this.ircChannel;
      }
      const ircInfo = {
        server: this.ircServer,
        channel: this.ircChannel,
        nick: this.ircNick,
        pass: this.ircPass,
      };
      this.irc = new IRCClient(ircInfo, this);
    }

    if (this.socket) {
      addHandlers(this);
    }
  }

  /**
   * Adds random videos using the database.
   *
   * @param {number} num Number of random videos to add.
   */
  addRandomVideos(num) {
    this.db.getVideos(num, (rows) => {
      if (!rows) {
        return;
      }

      rows.forEach((video) => this.addVideo(video.type, video.id));
    });
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

    cytubelog.log(`!~~~! Sending queue frame for ${json.id}`);
    this.addVideoLimiter.removeTokens(1).then(
        () => this.socket.emit('queue', json));
  };

  /**
   * Makes it so the user's videos are not stored into the database.
   *
   * Used by $blacklistuser.
   *
   * @param {string} username The user to blacklist.
   * @param {boolean} flag The flag to be set.
   */
  blacklistUser(username, flag) {
    if (typeof username === 'undefined' || typeof flag === 'undefined') {
      return;
    }

    this.db.insertUserBlacklist(
        username, flag, this.listBlacklistedUsers.bind(this));

    if (flag) {
      const uids = findVideosAddedByUser(this, username);
      for (let i = 0; i < uids.length; i++) {
        this.blacklistVideo(uids[i]);
      }
    }
  }

  /**
   * Blacklists the current video or uid.
   *
   * Used by $blacklist and blockUser().
   *
   * @param {string} uid A video we want to delete.
   * @param {Function=} callback The callback function.
   */
  blacklistVideo(uid, callback) {
    let type = '';
    let id = '';
    const flags = 1;
    let title = '';

    if (typeof uid !== 'undefined') {
      const video = getVideoFromUID(this, uid);
      type = video.media.type;
      id = video.media.id;
      title = video.media.title;

      this.db.flagVideo(type, id, flags, title);

      if (callback) {
        callback();
      }
      return;
    }

    type = this.currentMedia.type;
    id = this.currentMedia.id;
    title = this.currentMedia.title;

    this.db.flagVideo(type, id, flags, title);
  }

  /**
   * Blocks/unblocks a user from adding videos
   *
   * @param {string} username The user we are blocking/unblocking.
   * @param {boolean} flag The value.
   */
  blockUser(username, flag) {
    if (!username || typeof flag === 'undefined') {
      return;
    }

    this.db.insertUserBlock(username, flag, this.listBlockedUsers.bind(this));

    if (flag) {
      const uids = findVideosAddedByUser(this, username);
      for (const uid of uids) {
        this.blacklistVideo(uid, () => this.deleteVideo(uid));
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
   * Returns true or false depending if they have that perm.
   *
   * @param {string} username The user we're looking up.
   * @param {number} rank The rank the user should have.
   * @param {string} permission The permission to look up.
   * @param {!Function} callback The callback function.
   */
  checkPermission(username, rank, permission, callback) {
    perms.checkPermission(this, username, rank, permission, callback);
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

      const numToDelete =
          this.userlist[i].addedMedia.length - this.stats.userLimitNum;
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
   * @param {!Function} callback The callback function.
   */
  checkUserBlacklist(username, callback) {
    if (typeof username === 'undefined') {
      return;
    }

    this.db.getUserBlacklist(username, (flag) => {
      callback(flag === '1');
    });
  };

  /**
   * Checks whether a user is blocked from adding videos or not.
   *
   * @param {string} username The user to lookup.
   * @param {!Function} callback The callback function.
   */
  checkUserBlock(username, callback) {
    if (!username) {
      callback(false);
      return;
    }

    this.db.getUserBlock(username, (flag) => {
      callback(flag === '1');
    });
  }

  cleanDatabaseVideos() {
    this.db.getVideosCountForClean((num) => {
      this.sendChatMsg(`About to check ${num} videos`);
      this.db.getVideos(num, (videos) => {
        let count = 0;
        let numFlagged = 0;
        for (const video of videos) {
          if (video.type !== 'yt') {
            return;
          }

          const postValidate = (shouldDelete, why) => {
            if (shouldDelete) {
              numFlagged++;
            }

            if (count === num) {
              this.sendChatMsg(`Found ${numFlagged} invalid videos`);
            }
          };

          this.videoLookupLimiter.removeTokens(1, () => {
            count++;
            validateYouTubeVideo(
                this, video.id, video.type, video.title, postValidate);
          });
        }
      });
    });
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
      cytubelog.log(`!~~~! Sending delete frame for uid: ${uid}`);
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
      syslog.log(`!~~~! Disallowing: ${user}`);
      this.stats.disallow.push(user);
    } else if (indexOfUser !== -1 && !disallow) {
      syslog.log(`!~~~! Allowing: ${user}`);
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
   * Fetches a quote from database.
   *
   * Used by $quote.
   *
   * @param {string} nick The nickname of the user to get quotes from. If not
   *     given, it will get a random quote.
   */
  getQuote(nick) {
    this.db.getQuote(nick, (row) => {
      if (row === 0) {
        return;
      }

      const nick = row.username;
      const msg = filterMsg(row.msg);
      const time = new Date(time);
      const timestamp =
          time.toDateString() + ' ' + time.toTimeString().split(' ')[0];

      this.sendChatMsg(`[${nick} ${timestamp}] ${msg}`);
    });
  }

  /**
   * Gets the Cytube socketIO port.
   *
   * @param {string} server The input from config.json.
   */
  getSocketURL(server) {
    const defaultReg = /(https?:\/\/)?(.*:\d*)/;
    const serverData = {server: server, room: this.room};
    syslog.log('!~~~! Looking up socketIO info from server');

    socketLookup(serverData, null, (data) => {
      if (data.match(defaultReg)) {
        this.socket = socketIoClient(data);
        addHandlers(this);
        this.start();
      } else {
        errlog.log('!~~~! Error getting socket.io URL');

        process.exit(1);
      }
    });
    return;
  }

  /**
   * Fetches the number users, videos, and chat lines in the database.
   *
   * Used by $stats.
   */
  getGeneralStats() {
    const returnString = ['Videos:', 0, 'Chat:', 0, 'Users:', 0];
    const postDB = (rows) => {
      returnString[1] = rows[0].stat.split(' ')[0];
      returnString[3] = rows[1].stat.split(' ')[0];
      returnString[5] = rows[2].stat.split(' ')[0];

      this.sendChatMsg(returnString.join(' '));
    };

    this.db.getGeneralStats(postDB);
  }

  /**
   * Gets the stats required for the stats webpage.
   *
   * @param {!Function} callback The callback function.
   */
  getStats(callback) {
    this.db.getStats(this.room, (data) => {
      callback(data);
    });
  }

  /**
   * Handles queue frames from the server.
   *
   * @param {?} data The queue data.
   */
  handleAddMedia(data) {
    // See if we should delete this video right away because that user has too
    // many videos
    const pos = findUser(this, data.item.queueby);
    if (typeof pos !== 'undefined') {
      if (this.stats.userLimit &&
          this.userlist[pos].addedMedia.length >= this.stats.userLimitNum) {
        this.sendPM(data.item.queueby, 'You have too many videos on the list');
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
      cytubelog.log(`#~~# Adding video after: ${index}`);
      this.playlist.splice(index + 1, 0, data.item);
    }

    this.validateVideo(data.item, (block, uid) => {
      if (block) {
        return this.deleteVideo(uid);
      }
    });
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
      syslog.log(`!~~~! Added User: ${data.name}`);
      syslog.log(`!~~~! Userlist has : ${this.userlist.length} users`);
      this.countVideosAddedByUser(data.name);
    }
  }

  /**
   * Handles the banlist.
   *
   * If there is a unban function waiting to be executed it executes it
   *
   * @param {?} data The banlist.
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
        cytubelog.log(
            '!~~~! Media deleted. handleChangeMedia lookup temp failed');
      }

      if (typeof uid !== 'undefined' && !temp) {
        this.deleteVideo(uid);
      }
    }
    this.currentMedia = data;
    this.firstChangeMedia = false;
    cytubelog.log(`#~~# Current Video now ${this.currentMedia.title}`);
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
   * @param {boolean} pm Whether the message is a PM.
   */
  handleChatMsg(data, pm) {
    const username = data.username;
    let msg = data.msg;
    const time = data.time;

    cytubelog.log(`!~~~! Chat Message: ${username}: ${msg}`);

    const allowed = () => {
      if (this.stats.disallow.lastIndexOf(username) === -1) {
        return true;
      } else {
        this.sendPM(username, `You're not allowed to use the bot`);
        return false;
      }
    };

    // Ignore server messages
    if (username === '[server]') {
      return;
    }

    // Filter the message
    msg = filterMsg(msg);
    if (!msg) {
      return;
    }

    if (this.useIRC && this.loggedIn && !msg.startsWith('(') && !pm) {
      this.irc.sendMessage(`(${username}): ${msg}`);
    }

    // Try to avoid old commands from playback
    if (time < this.startTime) {
      return;
    }

    const handleCommand = msg.startsWith('$') &&
        username.toLowerCase() !== this.username.toLowerCase() &&
        this.loggedIn && allowed();

    if (handleCommand) {
      chatHandle(this, username, msg);
      return;
    }

    if (!pm) {
      this.recordEmoteCombo(username, msg);
    }

    if (pm) {
      return;
    }

    this.db.insertChat(msg, time, username, this.room);
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
      cytubelog.log(`#~~~# Deleting media at index: ${index}`);

      const addedBy = getVideoFromUID(this, uid).queueby;
      const pos = findUser(this, addedBy);

      if (typeof pos !== 'undefined') {
        // Remove the media from the user's addedMedia
        this.userlist[pos].addedMedia.splice(
            this.userlist[pos].addedMedia.indexOf(uid), 1);
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
   * Handles login frame from the server.
   *
   * @param {?} data The login data.
   */
  handleLogin(data) {
    if (!data.success) {
      syslog.log('!~~~! Failed to login');
      return;
    }

    this.sendChatMsg(
        'Bot starting up, please wait... MrDestructoid',
        /** override=*/ true);

    // Be sure we have the correct capitalization - some cytube functions
    // require it.
    this.username = data.name;
    this.socket.emit('requestPlaylist');

    // Start the connection to the IRC server.
    if (this.useIRC) {
      this.irc.start();
    }

    syslog.log('!~~~! Now handling commands');
    this.loggedIn = true;
    this.readTimes((data) => {
      this.sendChatMsg(`Now handling commands\nTimes restarted: ${data}`);
    });
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
    console.log(
        `#~~~# Current video time: ${data.currentTime} Paused: ${data.paused}`);

    this.leaderData.currentTime = data.currentTime;
    this.leaderData.paused = data.paused;

    const isLessThanSix = (this.currentMedia.seconds - data.currentTime) < 6;
    const playlistHasOneItem = this.playlist.length === 1;
    const shouldDoSomething =
        isLessThanSix && playlistHasOneItem && this.stats.managing;

    if (shouldDoSomething) {
      cytubelog.log('Shit son, we gotta do something, the video is ending');
      this.addRandomVideos();
    }
  }

  /**
   * Handles moveVideo frames from the server.
   *
   * @param {?} data moveMedia data.
   */
  handleMoveMedia(data) {
    const from = data.from;
    const after = data.after;
    const fromIndex = findIndexOfVideoFromUID(this, from);

    // Remove video.
    const removedVideo = this.playlist.splice(fromIndex, 1);
    const afterIndex = findIndexOfVideoFromUID(this, after);

    // And add it in the new position.
    this.playlist.splice(afterIndex + 1, 0, removedVideo[0]);
    cytubelog.log(`#~~~# Moving video from: ${fromIndex} after ${afterIndex}`);
  }

  /**
   * Handles needPassword frames from the server.
   *
   * needPasswords are sent when the room we are trying to join has a password.
   */
  handleNeedPassword() {
    if (this.roomPassword) {
      cytubelog.log('!~~~! Room has password; sending password');
      this.socket.emit('channelPassword', this.roomPassword);
      this.roomPassword = null;
    } else {
      cytubelog.log(
          '\n!~~~! No room password in config.json or password is wrong. ' +
          'Killing bot!\n');
      process.exit(1);
    }
  }

  /**
   * Handles playlist frames from the server and validates the videos.
   *
   * @param {?} playlist Playlist data.
   */
  handlePlaylist(playlist) {
    for (let i = 0; i < this.userlist.length; i++) {
      this.userlist[i].addedMedia = [];
    }

    const callbackFunction = (block, uid) => {
      if (block) {
        this.deleteVideo(uid);
      }
    };

    this.playlist = playlist;
    this.countVideosAddedByUser();
    if (this.playlist.length === 0 && this.stats.managing) {
      this.addRandomVideos();
    }

    for (const u of playlist) {
      this.validateVideo(u, callbackFunction);
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
      syslog.log('Error: handleSetTemp.index undefined.');
      return;
    }

    cytubelog.log(`#~~~# Setting temp: ${temp} on video at index ${index}`);
    this.playlist[index].temp = temp;
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
        cytubelog.log(`!~~~! Setting rank: ${data.rank} on ${data.name}`);
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
      syslog.log(`!~~~! Removed user: ${user}`);
      syslog.log(`!~~~! Userlist has : ${this.userlist.length} users`);
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

  /** Lists blacklisted users. */
  listBlacklistedUsers() {
    let blockedString = 'Blacklisted:';
    this.db.getAllBlacklistedUsers((users) => {
      if (users.length !== 0) {
        blockedString += ' ' + users.join(', ');
        this.sendChatMsg(blockedString);
      } else {
        blockedString += ' None';
        this.sendChatMsg(blockedString);
      }
    });
  }

  /** Lists all the blocked users. */
  listBlockedUsers() {
    let blockedString = 'Blocked:';
    this.db.getAllBlockedUsers((users) => {
      if (users.length !== 0) {
        blockedString += ' ' + users.join(', ');
        this.sendChatMsg(blockedString);
      } else {
        blockedString += ' None';
        this.sendChatMsg(blockedString);
      }
    });
  }

  /**
   * Reads the persistent settings or has the callback write the defaults.
   *
   * @param {!Function} callback callback function, used to write the persistent
   *     settings if they don't exist.
   */
  readPersistentSettings(callback) {
    readFile('persistent.json', (err, data) => {
      if (err) {
        return callback(true);
      } else {
        this.stats = JSON.parse(data);
        syslog.log('!~~~! Read persistent settings');
        callback(false);
      }
    });
  }

  /**
   * Reads the number of times the bot has been restarted.
   *
   * @param {!Function} callback The callback function.
   */
  readTimes(callback) {
    readFile('times', (err, data) => {
      if (err) {
        callback('Error reading times');
        return;
      } else {
        callback(data);
      }
    });
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

      const currentCount =
          this.emoteCombos.has(word) ? this.emoteCombos.get(word) : 0;
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

    cytubelog.log(`!~~~! Assigning leader to: ${user}`);
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

    cytubelog.log(`!~~~! Sending chatMsg: ${message}`);
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

    cytubelog.log(`!~~~! Setting time on video to: ${time} Paused: ${paused}`);

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
   * @param {?} from The position of the video before.
   */
  sendMoveMedia(from) {
    if (typeof from === 'undefined') {
      return;
    }
    cytubelog.log(`!~~~! Sending moveMedia frame for uid: ${from}`);
    this.socket.emit('moveMedia', {
      from: from,
      after: this.currentUID,
    });
  }

  /**
   * Sends a private message.
   *
   * @param {string} to The person we wish to send the message to.
   * @param {string} msg The message.
   */
  sendPM(to, msg) {
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
   * Sends a chatMsg with the status of the bot.
   *
   * (ie. is the bot muted or managing)
   */
  sendStatus() {
    const status = `[Muted: ${this.stats.muted}; ` +
        `Managing playlist: ${this.stats.managing}; ` +
        `Userlimit: ${this.stats.userLimit}; ` +
        `Userlimit Number: ${this.stats.userLimitNum}]`;

    this.socket.emit('chatMsg', {
      msg: status,
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
    cytubelog.log(`!~~~! Sending unban for: ${JSON.stringify(json)}`);
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
    syslog.log('Starting bot');
    this.socket.emit('initChannelCallbacks');
    this.socket.emit('joinChannel', {name: this.room});
    this.socket.emit('login', {
      name: this.username,
      pw: this.pw,
    });
  }

  /**
   * Inserts the usercount into the database.
   *
   * @param {number} count The number of users.
   */
  storeUsercount(count) {
    this.db.insertUsercount(count, new Date().getTime());
  }

  /**
   * Interacts with CleverBot.
   *
   * This was moved from api.js in order to store the sessionId of cleverbot,
   * which lets it hold a conversation better.
   *
   * @param {string} message Message we are sending to Cleverbot
   * @param {!Function} callback Callback function
   */
  talk(message, callback) {
    if (this.talkBot === null) {
      callback('Cleverbot not configured');
      return;
    }

    this.talkLimiter.removeTokens(1).then(() => {
      Cleverbot.prepare(() => {
        this.talkBot.write(message, (response) => {
          callback(response.message);
        });
      });
    });
  }

  /** Turns off log writing. */
  turnOffLogging() {
    errlog.enabled = false;
    cytubelog.enabled = false;
    syslog.enabled = false;
    errlog.close();
    cytubelog.close();
    syslog.close();
  }

  /**
   * Validates a given video to ensure that it hasn't been blocked or that it
   * can be played in the country specified in `deleteIfBlockedIn` (if given).
   *
   * Optionally uses youtube look up if we have the apikey.
   *
   * @param {string} video The video we want to validate.
   * @param {Function} callback The callback function, usually used to initiate
   *     a deleteVideo.
   */
  validateVideo(video, callback) {
    const type = video.media.type;
    const id = video.media.id;
    const title = video.media.title;
    const dur = video.media.seconds;
    const nick = video.queueby;
    const uid = video.uid;
    let rank = 0;

    try {
      rank = getUser(this, nick).rank;
    } catch (e) {
      rank = 0;
    }

    const postUserBlacklist = (blacklist) => {
      if (!blacklist) {
        return;
      }

      this.blacklistVideo(uid);
    };

    const postValidate = (shouldDelete, why) => {
      if (!shouldDelete) {
        return this.checkUserBlacklist(nick, postUserBlacklist);
      }

      switch (why) {
        case 'disabled':
          syslog.log(`!~~! Emedding disabled: ${id}`);
          this.sendPM(nick, `Embedding disabled: ${id}`);
          break;

        case 'blocked':
          syslog.log(`!~~~! Video blocked in: ${this.deleteIfBlockedIn}`);
          this.sendPM(
              nick, `Video blocked in: ${this.deleteIfBlockedIn}. id: ${id}`);
          break;

        case 'invalid':
          syslog.log(`!~~~! Invalid video: ${id}`);
          this.sendPM(nick, `Invalid video: ${id}`);
          break;

        default:
          syslog.log(`!~~~! Invalid video: ${id}`);
          this.sendPM(nick, `Error: Video might not play. Deleting: ${id}`);
          break;
      }

      return callback(true, uid);
    };

    const postUserBlock = (block) => {
      if (block) {
        this.db.flagVideo(type, id, 1, title);
        this.sendPM(nick, `You're blocked from adding videos.`);
        return callback(true, uid);
      }

      if (type === 'yt' && this.youtubeapi) {
        validateYouTubeVideo(this, id, type, title, postValidate);
      } else {
        this.checkUserBlacklist(nick, postUserBlacklist);
      }
    };

    const postVideoFlag = (row) => {
      if (row.flags === 2 && rank < 2) {
        this.sendPM(nick, `Video blocked: ${title}`);
        return callback(true, uid);
      }
      this.checkUserBlock(nick, postUserBlock);
    };

    if (nick.toLowerCase() !== this.username.toLowerCase()) {
      this.db.insertVideo(type, id, title, dur, nick);
    }

    // Start validation.
    this.db.getVideoFlag(type, id, postVideoFlag);
  }

  // Updates the persistent settings
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

    if (Object.prototype.toString.call(this.stats.disallow) ===
        '[object Object]') {
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
  writePersistentSettings() {
    syslog.log('!~~~! Writing persistent settings');
    const stringyJSON = JSON.stringify(this.stats);
    writeFile('persistent.json', stringyJSON, (err) => {
      if (err) {
        errlog.log(err);
        process.exit(1);
      }
    });
  }
}
