const api = require('./apiclient');
const Cleverbot = require('cleverbot-node');
const commands = require('./chatcommands');
const Database = require('./database');
const fs = require('fs');
const botHandlers = require('./bothandlers');
const IOServer = require('./ioserver');
const IRC = require('./ircclient');
const logger = require('./logger');
const perms = require('./permissions');
const Server = require('./webserver');
const RateLimiter = require('limiter').RateLimiter;
const TokenBucket = require('limiter').TokenBucket;
const utils = require('./utils');
const validator = require('./validate');

module.exports = {
  init: (cfg) => {
    logger.syslog.log('Setting up bot');
    var bot = new CytubeBot(cfg);
    return bot;
  },
};

// Constructor
class CytubeBot {
  constructor(config) {
    var bot = this;

    // Begin config things

    // Cytube user info
    this.cytubeServer = config['cytubeServer'];
    this.flair = config['usemodflair'];
    this.pw = config['pw'];
    this.room = config['room'];
    this.roomPassword = config['roompassword'];
    this.username = config['username'];
    this.maxVideoLength = config['maxvideolength'];

    // Logging
    this.useLogger = config['enableLogging'];
    this.logger = logger;
    if (!this.useLogger) {
      this.turnOffLogging();
    }

    // APIs
    this.mstranslateclient = config['mstranslateclient'];
    this.mstranslatesecret = config['mstranslatesecret'];
    this.weatherunderground = config['weatherunderground'];
    this.wolfram = config['wolfram'];
    if (this.wolfram) {
      this.wolfram = this.wolfram.toLowerCase();
    }
    this.youtubeapi = config['youtubev3'];
    this.deleteIfBlockedIn = config['deleteIfBlockedIn'];
    if (this.deleteIfBlockedIn) {
      this.deleteIfBlockedIn = this.deleteIfBlockedIn.toUpperCase();
    }

    // Webserver
    this.enableWebServer = config['enableWebServer'];
    this.socketPort = config['socketPort'];
    this.webURL = config['webURL'];
    this.webPort = config['webPort'];

    // IRC
    this.irc = {};
    this.useIRC = config['useIRC'];
    this.ircServer = config['ircServer'];
    this.ircChannel = config['ircChannel'];
    this.ircNick = config['ircNick'];
    this.ircPass = config['ircPass'];

    // Cleverbot
    this.talkBot = null;

    // End config things

    // Channel data
    this.userlist = [];
    this.playlist = [];
    this.previousUID = null;
    this.currentUID = null;
    this.currentMedia = {};
    this.leaderData = {'currentTime': 0, 'paused': false};
    this.firstChangeMedia = true;
    this.channelEmotes = [];
    this.banlist = [];

    // Cooldown times / Rate Limiters
    // 10 requests per min is the limit for weatherunderground
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
    this.socket = this.getSocketURL(this.cytubeServer);
    this.startTime = new Date().getTime();
    this.db = Database.init(this.logger, this.maxVideoLength);
    this.isLeader = false;
    this.loggedIn = false;
    this.waitingFunctions = [];
    this.stats = {
      'managing': false,
      'muted': false,
      'hybridMods': {},
      'userLimit': false,
      'userLimitNum': 10,
      'disallow': [],
    };

    this.talkBot = new Cleverbot;

    this.readPersistentSettings(err => {
      if (err) {
        bot.writePersistentSettings();
      }

      bot.updatePersistentSettings();
    })

    // Webserver
    if (this.enableWebServer) {
      this.server = Server.init(this);
      this.ioServer = IOServer.init(this.socketPort, this);
    }

    // IRC connection
    if (this.useIRC) {
      if (this.ircChannel.indexOf('#') !== 0) {
        this.ircChannel = '#' + this.ircChannel;
      }
      var ircInfo = {
        'server': this.ircServer,
        'channel': this.ircChannel,
        'nick': this.ircNick,
        'pass': this.ircPass,
      };
      this.irc = IRC.init(ircInfo, this);
    }

    // Add handlers
    if (this.socket) {
      botHandlers.addHandlers(this);
    }
  }

  // Adds random videos using the database
  // num - Number of random videos to add
  addRandomVideos(num) {
    var bot = this;

    var postGet = (video) => {
      var type = video['type'];
      var id = video['id'];
      var duration = video['duration_ms'] / 1000;

      bot.addVideo(type, id, duration);
    };

    this.db.getVideos(num, rows => {
      if (!rows) {
        return;
      }

      // Add each video
      rows.forEach(video => postGet(video));
    });
  }


  // Sends a queue frame to the server
  // type - the type of media ie. yt
  // duration - the duration of the video, in seconds. Not really used atm
  // temp - whether to add the media as temporary or not
  // parsedLink - param used when $add is called
  // pos - position to add
  addVideo(type, id, duration, temp, pos, parsedLink) {
    var json = {};
    var bot = this;

    if (typeof pos === 'undefined') {
      pos = 'end';
    }

    if (typeof temp === 'undefined' || temp === null) {
      temp = false;
    }

    if (!parsedLink) {
      json = {
        'id': id,
        'type': type,
        'pos': pos,
        'duration': 0,
        'temp': temp,
      };
      this.logger.cytubelog.log('!~~~! Sending queue frame for ' + json['id']);
      this.addVideoLimiter.removeTokens(
          1, () => bot.socket.emit('queue', json));
    } else {
      json = {
        'id': parsedLink['id'],
        'type': parsedLink['type'],
        'pos': pos,
        'duration': 0,
        'temp': temp,
      };
      this.logger.cytubelog.log('!~~~! Sending queue frame for ' + json['id']);
      this.addVideoLimiter.removeTokens(
          1, () => bot.socket.emit('queue', json));
    }
  };

  // Used by $blacklistuser
  // Makes it so the user's videos are not stored into the database
  // username - The user to blacklist
  // flag - The flag to be set
  blacklistUser(username, flag) {
    var bot = this;
    if (typeof username === 'undefined' || typeof flag === 'undefined') {
      return;
    }

    this.db.insertUserBlacklist(
        username, flag, bot.listBlacklistedUsers.bind(this));

    if (flag) {
      var uids = utils.handle(this, 'findVideosAddedByUser', username);
      for (var i = 0; i < uids.length; i++) {
        this.blacklistVideo(uids[i]);
      }
    }
  }

  // Used by $blacklist and blockUser()
  // Blacklists the current video or uid
  // uid - A video we want to delete
  // callback - The callback function
  blacklistVideo(uid, callback) {
    var type = '';
    var id = '';
    var flags = 1;
    var title = '';

    if (typeof uid !== 'undefined') {
      var video = utils.handle(this, 'getVideoFromUID', uid);
      type = video['media']['type'];
      id = video['media']['id'];
      title = video['media']['title'];

      this.db.flagVideo(type, id, flags, title);

      if (typeof callback === 'function') {
        return callback();
      } else {
        return;
      }
    }

    type = this.currentMedia['type'];
    id = this.currentMedia['id'];
    title = this.currentMedia['title'];

    this.db.flagVideo(type, id, flags, title);
  }

  // Blocks/unblocks a user from adding videos
  // username - The user we are blocking/unblocking
  // flag - The value. true/false
  blockUser(username, flag) {
    var bot = this;
    if (!username || typeof flag === 'undefined') {
      return;
    }

    const deleteFun = () => bot.deleteVideo(uids[i]);

    this.db.insertUserBlock(username, flag, bot.listBlockedUsers.bind(this));

    if (flag) {
      var uids = utils.handle(this, 'findVideosAddedByUser', username);
      for (var i = 0; i < uids.length; i++) {
        this.blacklistVideo(uids[i], deleteFun);
      }
    }
  }

  // Used by $autodelete
  // Makes it so the current video cannot be added by non-mods
  blockVideo() {
    var type = this.currentMedia['type'];
    var id = this.currentMedia['id'];
    var uid = this.currentUID;
    var flags = 2;
    var title = this.currentMedia['title'];

    this.db.flagVideo(type, id, flags, title);
    this.deleteVideo(uid);
  }

  // Checks if the user has a given permission
  // Returns true or false depending if they have that perm
  // username - The user we're looking up
  // rank - The rank the user should have
  // permission - The permission to look up
  // callback - The callback function
  checkPermission(username, rank, permission, callback) {
    var permData = {
      username: username,
      rank: rank,
      permission: permission,
      callback: callback,
    };

    perms.handle(this, 'checkPermission', permData);
  }

  // Checks if users have too many items on the playlist
  // And if so, delete them
  checkPlaylist() {
    var bot = this;
    if (!this.stats['userLimit']) {
      return;
    }

    for (var i = 0; i < this.userlist.length; i++) {
      if (this.userlist[i]['addedMedia'].length > this.stats['userLimitNum']) {
        // How many should we delete
        var numDelete =
            this.userlist[i]['addedMedia'].length - this.stats['userLimitNum'];
        var uids = bot.userlist[i]['addedMedia'].reverse();

        // Delete the videos
        for (var u = 0; u < numDelete; u++) {
          bot.deleteVideo(uids[u]);
        }
      }
    }
  }

  // Checks whether a user is blacklisted
  // username - The user we are checking
  // callback - The callback function
  checkUserBlacklist(username, callback) {
    if (typeof username === 'undefined') {
      return;
    }

    this.db.getUserBlacklist(username, flag => {
      if (flag === '1') {
        callback(true);
      } else {
        callback(false);
      }
    })
  };

  // Checks whether a user is blocked from adding videos or not
  // username - The user to lookup
  // callback - The callback function
  checkUserBlock(username, callback) {
    if (!username) {
      return callback(false)
    }

    this.db.getUserBlock(username, flag => {
      if (flag === '1') {
        callback(true);
      } else {
        callback(false);
      }
    });
  }

  cleanDatabaseVideos() {
    var self = this;

    this.db.getVideosCountForClean(num => {
      self.sendChatMsg('About to check ' + num + ' Videos');
      self.db.getVideos(num, videos => {
        var count = 0
        var numFlagged = 0
        videos.forEach(video => {
          if (video.type !== 'yt') {
            return;
          }

          var postValidate = (shouldDelete, why) => {
            if (shouldDelete) {
              numFlagged++;
            }

            if (count === num) {
              self.sendChatMsg('Found ' + numFlagged + ' invalid videos');
            }
          };

          self.videoLookupLimiter.removeTokens(1, () => {
            count++;
            validator.validate(
                self, video.id, video.type, video.title, postValidate);
          });
        });
      });
    });
  }

  // Gets the videos added by username
  // Adds to their userlist.item.addedMedia
  // If no username is given we check the whole playlist
  // username - The user we are adding videos to
  countVideosAddedByUser(username) {
    if (!username) {
      for (var i = 0; i < this.userlist.length; i++) {
        var uids = utils.handle(
            this, 'findVideosAddedByUser', this.userlist[i]['name']);
        this.userlist[i]['addedMedia'] = uids;
      }
      return;
    }
    var pos = utils.handle(this, 'findUser', username);
    this.userlist[pos]['addedMedia'] =
        utils.handle(this, 'findVideosAddedByUser', username);
  }

  // Used by $poll
  // Sends a newPoll frame to the server
  // This will create a new poll
  // poll - Poll object
  createPoll(poll) {
    this.socket.emit('newPoll', poll)
  }

  // Used by various methods
  // Sends a delete frame to the server
  // uid - The uid of the video to delete
  deleteVideo(uid) {
    if (typeof uid !== 'undefined') {
      this.logger.cytubelog.log('!~~~! Sending delete frame for uid: ' + uid);
      this.socket.emit('delete', uid);
    }
  }

  // WARNING - This is experimental
  // Deletes videos from the database that are like like
  // like - What to match. Example: %skrillex% will delete all videos
  // with the word "skrillex" in it
  deleteVideosFromDatabase(like) {
    var bot = this;
    this.db.deleteVideos(like, num => {
      bot.sendChatMsg('Deleted: ' + num + ' videos');
    })
  }

  // Used by $disallow
  // Users who are disallowed cannot use the bot
  // user - The user to disallow/allow
  // disallow - true/false true we disallow, false we allow
  disallowUser(user, disallow) {
    if (typeof user === 'undefined') {
      return;
    }

    user = user.toLowerCase();
    var indexOfUser = this.stats['disallow'].lastIndexOf(user);

    if (disallow && indexOfUser === -1) {
      this.logger.syslog.log('!~~~! Disallowing: ' + user);
      this.stats['disallow'].push(user);
    } else if (indexOfUser !== -1 && !disallow) {
      this.logger.syslog.log('!~~~! Allowing: ' + user);
      this.stats['disallow'].splice(indexOfUser, 1);
    }

    this.writePersistentSettings();
  }

  // Used by $endpoll
  // Sends a closePoll frame to the server
  // Closes a poll
  endPoll() {
    this.socket.emit('closePoll');
  }

  // Used by $quote
  // Fetches a quote from database. If no nick is given, it will
  // get a random quote.
  // nick - the nickname of the user to get quotes from
  getQuote(nick) {
    var bot = this;
    this.db.getQuote(nick, row => {
      if (row === 0) {
        return;
      }

      var nick = row['username'];
      var msg = row['msg'];

      msg = utils.handle(this, 'filterMsg', msg);

      var time = row['timestamp'];
      var timestamp = new Date(time).toDateString() + ' ' +
          new Date(time).toTimeString().split(' ')[0];

      bot.sendChatMsg('[' + nick + ' ' + timestamp + '] ' + msg);
    });
  }

  // Gets the Cytube socketIO port
  // server - The input from config.json
  getSocketURL(server) {
    var bot = this;
    var defaultReg = /(https?:\/\/)?(.*:\d*)/;
    var serverData = {server: server, room: this.room};
    this.logger.syslog.log('!~~~! Looking up socketIO info from server');

    api.APICall(serverData, 'socketlookup', null, data => {
      if (data.match(defaultReg)) {
        bot.socket = require('socket.io-client')(data);
        botHandlers.addHandlers(bot);
        bot.start();
      } else {
        bot.logger.errlog.log('!~~~! Error getting socket.io URL');

        process.exit(1);
      }
    });
    return;
  }

  // Used by $stats
  // Fetches the number users, videos, and chat lines in
  // the database
  getGeneralStats() {
    var bot = this;
    var returnString = ['Videos:', 0, 'Chat:', 0, 'Users:', 0];
    var postDB = rows => {
      returnString[1] = rows[0]['stat'].split(' ')[0];
      returnString[3] = rows[1]['stat'].split(' ')[0];
      returnString[5] = rows[2]['stat'].split(' ')[0];

      // Send string
      bot.sendChatMsg(returnString.join(' '));
    };

    // Get data
    this.db.getGeneralStats(postDB);
  }

  // Gets the stats required for the stats webpage
  getStats(callback) {
    this.db.getStats(this.room, data => {callback(data)});
  }

  // Handles queue frams from the server
  // data - the queue data
  handleAddMedia(data) {
    var bot = this;

    // See if we should delete this video right away
    // because that user has too many videos
    var pos = utils.handle(this, 'findUser', data['item']['queueby']);
    if (typeof pos !== 'undefined') {
      if (this.stats['userLimit'] &&
          this.userlist[pos]['addedMedia'].length >=
              this.stats['userLimitNum']) {
        this.sendPM(
            data['item']['queueby'], 'You have too many videos on the list');
        this.deleteVideo(data['item']['uid']);
        return;
      }
      this.userlist[pos]['addedMedia'].push(data['item']['uid']);
    }

    if (this.playlist.length === 0) {
      this.playlist = [data['item']];
    } else {
      var uid = data['after'];
      var index = utils.handle(this, 'findIndexOfVideoFromUID', uid);
      this.logger.cytubelog.log('#~~# Adding video after: ' + index);
      this.playlist.splice(index + 1, 0, data['item']);
    }

    this.validateVideo(data['item'], (block, uid) => {
      if (block) {
        return bot.deleteVideo(uid);
      }
    })
  }

  // Handles addUser frames from the server
  // data - addUser data
  handleAddUser(data) {
    var inList = utils.handle(this, 'userInUserlist', data['name']);
    this.db.insertUser(data['name'], data['rank']);
    this.db.insertUserRank(data['name'], data['rank']);
    if (!inList) {
      this.userlist.push(data);
      this.logger.syslog.log('!~~~! Added User: ' + data['name']);
      this.logger.syslog.log(
          '!~~~! Userlist has : ' + this.userlist.length + ' users');
      this.countVideosAddedByUser(data['name']);
    }
  }

  // Handles the banlist
  // If there is a unban function waiting to be executed
  // it executes it
  // data - The banlist
  handleBanlist(data) {
    var bot = this;
    this.banlist = data;

    utils.handle(this, 'loopThroughWaiting', 'unban');
  }

  // Handles changeMedia frames from the server
  // If the bot is managing the playlist and the last video was not
  // temporary it sends a delete frame.
  // data - changeMedia data
  handleChangeMedia(data) {
    if (this.stats['managing'] && this.loggedIn && !this.firstChangeMedia &&
        this.playlist.length !== 0) {
      var temp = true;
      var uid = this.previousUID;

      // Try our best to find out if the video is temp
      // If we get an exception it's because the media was deleted
      try {
        if (typeof uid !== 'undefined') {
          temp = utils.handle(this, 'getVideoFromUID', uid)['temp'];
        }
      } catch (e) {
        this.logger.cytubelog.log(
            '!~~~! Media deleted. handleChangeMedia lookup temp failed');
      }

      if (typeof uid !== 'undefined' && !temp) {
        this.deleteVideo(uid);
      }
    }
    this.currentMedia = data;
    this.firstChangeMedia = false;
    this.logger.cytubelog.log(
        '#~~# Current Video now ' + this.currentMedia['title']);
  }

  // Handles chatMsg frames from the server
  // If the first character of the msg is $, we interpet it as a command.
  // We ignore chat from before the bot was started, in order to avoid old
  // commands.
  handleChatMsg(data, pm) {
    var bot = this;
    var username = data['username'];
    var msg = data['msg'];
    var time = data['time'];

    this.logger.cytubelog.log('!~~~! Chat Message: ' + username + ': ' + msg);

    var allowed = () => {
      if (bot.stats['disallow'].lastIndexOf(username) === -1) {
        return true;
      } else {
        bot.sendPM(username, 'You\'re not allowed to use the bot');
        return false;
      }
    };

    // Ignore server messages
    if (username === '[server]') {
      return;
    }

    // Filter the message
    msg = utils.handle(this, 'filterMsg', msg);
    if (!msg) {
      return;
    }

    if (this.useIRC && this.loggedIn && msg.indexOf('(') !== 0 && !pm) {
      this.irc.sendMessage('(' + username + '): ' + msg);
    }

    // Try to avoid old commands from playback
    if (time < this.startTime) {
      return;
    }

    var handleCommand = msg.indexOf('$') === 0 &&
        username.toLowerCase() !== this.username.toLowerCase() &&
        this.loggedIn && allowed();

    if (handleCommand) {
      return commands.handle(this, username, msg);
    }

    if (pm) {
      return;
    }

    this.db.insertChat(msg, time, username, this.room);
  }

  // Handles delete frames from the server
  // If there are no more videos in the playlist and
  // we are managing, add a random video
  // data - delete data
  handleDeleteMedia(data) {
    var uid = data['uid'];
    var index = utils.handle(this, 'findIndexOfVideoFromUID', uid);

    if (typeof index !== 'undefined') {
      this.logger.cytubelog.log('#~~~# Deleting media at index: ' + index);

      var addedBy = utils.handle(this, 'getVideoFromUID', uid)['queueby'];
      var pos = utils.handle(this, 'findUser', addedBy);

      if (typeof pos !== 'undefined') {
        // Remove the media from the user's addedMedia
        this.userlist[pos]['addedMedia'].splice(
            this.userlist[pos]['addedMedia'].indexOf(uid), 1);
      }

      this.playlist.splice(index, 1);
      if (this.playlist.length === 0 && this.stats['managing']) {
        this.addRandomVideos();
      }
    }
  }

  // Handles changes to the channel emote list
  // emote - The emote object that has changed
  handleEmoteUpdate(emote) {
    if (!this.enableWebServer) {
      return;
    }

    for (var i = 0; i < this.channelEmotes.length; i++) {
      if (this.channelEmotes[i]['name'] === emote['name']) {
        this.channelEmotes[i] = emote;
        return;
      }
    }

    this.channelEmotes.push(emote);
  }

  // Used by $permissions
  // Handles a change in hybridMods or calls sendHybridModPermissions if no
  // permission is given. permission - The permission we are changing, or
  // undefined if there is none name - name of the user we want to change
  // permissions for, or look up
  handleHybridModPermissionChange(permission, name) {
    var permData = {
      permission: permission,
      name: name,
    };

    perms.handle(this, 'handleHybridModPermissionChange', permData);
  }

  // Handles login frame from the server
  // data - The login data
  handleLogin(data) {
    var bot = this;
    if (!data['success']) {
      return this.logger.syslog.log('!~~~! Failed to login');
    }

    // Be sure we have the correct capitalization
    // Some cytube functions require proper capitalization
    this.username = data['name'];
    this.socket.emit('requestPlaylist');

    // Start the connection to the IRC server
    if (this.useIRC) {
      this.irc.start();
    }

    this.logger.syslog.log('!~~~! Now handling commands');
    this.loggedIn = true;
    this.readTimes(data => {
      bot.sendChatMsg('Now handling commands\nTimes restarted: ' + data);
    });
  }

  // Handles mediaUpdate frames from the server
  // If we are managing and the playlist only has one item
  // and the video is about to end, we add a random video
  handleMediaUpdate(data) {
    console.log(
        '#~~~# Current video time: ' + data['currentTime'] +
        ' Paused: ' + data['paused']);

    this.leaderData['currentTime'] = data['currentTime'];
    this.leaderData['paused'] = data['paused'];

    var isLessThanSix =
        (this.currentMedia['seconds'] - data['currentTime']) < 6;
    var playlistHasOneItem = this.playlist.length === 1;
    var doSomething =
        isLessThanSix && playlistHasOneItem && this.stats['managing'];

    if (doSomething) {
      this.logger.cytubelog.log(
          'Shit son, we gotta do something, the video is ending');
      this.addRandomVideos();
    }
  }

  // Handles moveVideo frames from the server
  // data - moveMedia data
  handleMoveMedia(data) {
    var from = data['from'];
    var after = data['after'];
    var fromIndex = utils.handle(this, 'findIndexOfVideoFromUID', from);

    // Remove video
    var removedVideo = this.playlist.splice(fromIndex, 1);
    var afterIndex = utils.handle(this, 'findIndexOfVideoFromUID', after);

    // And add it in the new position
    this.playlist.splice(afterIndex + 1, 0, removedVideo[0]);
    this.logger.cytubelog.log(
        '#~~~# Moving video from: ' + fromIndex + ' after ' + afterIndex);
  }

  // Handles needPassword frames from the server
  // needPasswords are sent when the room we are trying to join has a password
  handleNeedPassword() {
    if (this.roomPassword) {
      this.logger.cytubelog.log('!~~~! Room has password; sending password');
      this.socket.emit('channelPassword', this.roomPassword);
      this.roomPassword = null;
    } else {
      this.logger.cytubelog.log(
          '\n!~~~! No room password in config.json or password is wrong. Killing bot!\n');
      process.exit(1);
    }
  }

  // Handles playlist frames from the server and validates the videos
  // playlist - playlist data
  handlePlaylist(playlist) {
    var bot = this;
    for (var i = 0; i < this.userlist.length; i++) {
      this.userlist[i]['addedMedia'] = [];
    }

    var callbackFunction = (block, uid) => {
      if (block) {
        bot.deleteVideo(uid);
      }
    };

    this.playlist = playlist;
    this.countVideosAddedByUser();
    if (this.playlist.length === 0 && this.stats['managing']) {
      this.addRandomVideos();
    }

    for (var u in playlist) {
      this.validateVideo(playlist[u], callbackFunction);
    }
  }

  // Handles a removeEmote frame
  // emote - The emote to be removed
  handleRemoveEmote(emote) {
    if (!this.enableWebServer) {
      return;
    }

    var index = -1;

    for (var i = 0; i < this.channelEmotes.length; i++) {
      if (this.channelEmotes[i]['name'] === emote['name']) {
        index = i;
        break;
      }
    }

    if (index !== -1) {
      this.channelEmotes.splice(index, 1);
    }
  }

  // Handles setCurrent frames from the server
  // This is a better way of handling the current media UID problem
  // uid - UID of the current video
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
      utils.handle(this, 'loopThroughWaiting', 'settime');
    } else {
      this.isLeader = false;
    }
  }

  // Handles setTemp frames from the server
  // data - setTemp data
  handleSetTemp(data) {
    var temp = data['temp'];
    var uid = data['uid'];

    var index = utils.handle(this, 'findIndexOfVideoFromUID', uid);

    if (typeof index === 'undefined') {
      return this.logger.syslog.log('Error: handleSetTemp.index undefined.');
    }

    this.logger.cytubelog.log(
        '#~~~# Setting temp: ' + temp + ' on video at index ' + index);
    this.playlist[index]['temp'] = temp;
  }

  // Handles setUserRank frames from the server
  // data - setUserRank data
  handleSetUserRank(data) {
    for (var i = 0; i < this.userlist.length; i++) {
      if (this.userlist[i]['name'].toLowerCase() ===
          data['name'].toLowerCase()) {
        this.userlist[i]['rank'] = data['rank'];
        this.db.insertUserRank(data['name'], data['rank']);
        this.logger.cytubelog.log(
            '!~~~! Setting rank: ' + data['rank'] + ' on ' + data['name']);
        break;
      }
    }
  }

  // Handles userLeave frames from the server
  // user - userLeave data
  handleUserLeave(user) {
    var index = utils.handle(this, 'findUser', user);
    if (typeof index !== 'undefined') {
      this.userlist.splice(index, 1);
      this.logger.syslog.log('!~~~! Removed user: ' + user);
      this.logger.syslog.log(
          '!~~~! Userlist has : ' + this.userlist.length + ' users');
    }
  }

  // Handles userlist frames from the server
  // userlistData - userlist data
  handleUserlist(userlistData) {
    this.userlist = userlistData;
    this.countVideosAddedByUser();

    for (var i = 0; i < this.userlist.length; i++) {
      this.db.insertUser(this.userlist[i]['name'], this.userlist[i]['rank']);
      this.db.insertUserRank(
          this.userlist[i]['name'], this.userlist[i]['rank']);
    }
  }

  // Lists blacklisted users
  listBlacklistedUsers() {
    var bot = this;
    var blockedString = 'Blacklisted:';
    this.db.getAllBlacklistedUsers(users => {
      if (users.length !== 0) {
        blockedString += ' ' + users.join(', ');
        bot.sendChatMsg(blockedString);
      } else {
        blockedString += ' None';
        bot.sendChatMsg(blockedString);
      }
    });
  }

  // Lists all the blocked users
  listBlockedUsers() {
    var bot = this;
    var blockedString = 'Blocked:';
    this.db.getAllBlockedUsers(users => {
      if (users.length !== 0) {
        blockedString += ' ' + users.join(', ');
        bot.sendChatMsg(blockedString);
      } else {
        blockedString += ' None';
        bot.sendChatMsg(blockedString);
      }
    });
  }

  // Reads the persistent settings or has the callback write the defaults
  // callback - callback function, used to write the persistent settings
  // if they don't exist
  readPersistentSettings(callback) {
    var bot = this;
    fs.readFile('persistent.json', (err, data) => {
      if (err) {
        return callback(true);
      } else {
        bot.stats = JSON.parse(data);
        bot.logger.syslog.log('!~~~! Read persistent settings');
        callback(false);
      }
    });
  }

  // Reads the number of times the bot has been restarted
  // callback - The callback function
  readTimes(callback) {
    fs.readFile('times', (err, data) => {
      if (err) {
        return callback('Error reading times');
      } else {
        callback(data);
      }
    });
  }

  // Sends an assignLeader frame to the server
  // user - Name of the user we're setting leader
  sendAssignLeader(user) {
    var rank = 0;

    try {
      rank = utils.handle(this, 'getUser', this.username)['rank'];
    } catch (e) {
    }  // Not in list

    // Sending assignLeader if not mod resuslts in being kicked
    if (rank < 2) {
      return 1;
    }

    this.logger.cytubelog.log('!~~~! Assigning leader to: ' + user);
    this.socket.emit('assignLeader', {name: user});
  }

  // Sends a chatMsg frame to the server
  // If we are using modflair it will try and send meta for it
  // message - message to be sent
  sendChatMsg(message, override) {
    // Rank is used to send the modflair
    var rank = 0

    // If we're muted or not done initializing, there's no point in continuing
    if ((this.stats['muted'] && !override) || !this.loggedIn) {
      return;
    }

    this.logger.cytubelog.log('!~~~! Sending chatMsg: ' + message);
    rank = utils.handle(this, 'getUser', this.username.toLowerCase());
    if (typeof rank !== 'undefined') {
      rank = rank['rank'];
    }

    if (!this.flair) {
      this.socket.emit('chatMsg', {
        msg: message,
        meta: {},
      });
    } else {
      this.socket.emit('chatMsg', {
        msg: message,
        meta: {'modflair': rank},
      });
    }
  }

  // Sends the hybridmod permissions for name
  // name - name to send hybridmod permissions for
  sendHybridModPermissions(name) {
    if (name) {
      this.sendChatMsg(name + ': ' + this.stats['hybridMods'][name]);
    }
  }

  // Sends a mediaUpdate frame
  // time - The time the video is at, or the time we want to set
  // paused - Should we pause the video
  sendMediaUpdate(time, paused) {
    if (typeof time !== 'number' || typeof paused === 'undefined') {
      return;
    } else if (!this.isLeader || !this.currentMedia) {
      return;
    }

    this.logger.cytubelog.log(
        '!~~~! Setting time on video to: ' + time + ' Paused: ' + paused);

    this.socket.emit('mediaUpdate', {
      id: this.currentMedia['id'],
      currentTime: time,
      paused: paused,
      type: this.currentMedia['type'],
    });
  }

  // Used by $bump
  // Sends a moveMedia frame to the server9
  // from - The position of the video before
  sendMoveMedia(from) {
    if (typeof from !== 'undefined') {
      this.logger.cytubelog.log(
          '!~~~! Sending moveMedia frame for uid: ' + from);
      this.socket.emit('moveMedia', {
        from: from,
        after: this.currentUID,
      });
    }
  }

  // Sends a Private message
  // to - The person we wish to send the message to
  // msg - The message
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

  // Sends a chatMsg with the status of the bot
  // ie. is the bot muted or managing
  sendStatus() {
    const status = '[Muted: ' + this.stats['muted'] +
        '; Managing playlist: ' + this.stats['managing'] +
        '; Userlimit: ' + this.stats['userLimit'] +
        '; Userlimit Number: ' + this.stats['userLimitNum'] + ']';

    this.socket.emit('chatMsg', {
      msg: status,
      meta: {},
    });
  }

  // Sends an unban frame to the server
  // json - unban data in the form {id: banId, name: username}
  sendUnban(json) {
    this.logger.cytubelog.log(
        '!~~~! Sending unban for: ' + JSON.stringify(json));
    this.socket.emit('unban', json);
  }

  // Used by $shuffle
  // Emits a shufflePlaylist frame
  shufflePlaylist() {
    this.socket.emit('shufflePlaylist');
  }

  // Used to start the process of joining a channel
  // Called after we have initialized the bot and set socket listeners
  start() {
    var bot = this;

    this.logger.syslog.log('Starting bot');
    this.socket.emit('initChannelCallbacks');
    this.socket.emit('joinChannel', {name: this.room});
    this.socket.emit('login', {
      name: this.username,
      pw: this.pw,
    });
  }

  // Inserts the usercount into the database
  // count - The number of users
  storeUsercount(count) {
    this.db.insertUsercount(count, new Date().getTime());
  }

  // Interacts with CleverBot
  // This is being moved from api.js in order to store the sessionId of
  // cleverbot This lets it hold a conversation better message - Message we are
  // sending to Cleverbot callback - Callback function
  talk(message, callback) {
    var self = this;

    if (this.talkBot === null) {
      callback('Cleverbot not configured');
      return;
    }

    this.talkLimiter.removeTokens(1, () => {
      Cleverbot.prepare(() => {
        self.talkBot.write(message, response => {
          callback(response.message);
        });
      });
    })
  }

  // Turns off log writing
  turnOffLogging() {
    this.logger.errlog.enabled = false;
    this.logger.cytubelog.enabled = false;
    this.logger.syslog.enabled = false;
    this.logger.errlog.close();
    this.logger.cytubelog.close();
    this.logger.syslog.close();
  }

  // Validates a given video to ensure that it hasn't been blocked
  // or that it can be played in the country specified in deleteIfBlockedIn (if
  // given) Optionally uses youtube look up if we have the apikey video - The
  // video we want to validate callback - the callback function, usually used to
  // initiate a deleteVideo
  validateVideo(video, callback) {
    var bot = this;
    var type = video['media']['type'];
    var id = video['media']['id'];
    var title = video['media']['title'];
    var dur = video['media']['seconds'];
    var nick = video['queueby'];
    var uid = video['uid'];
    var rank = 0;

    try {
      rank = utils.handle(this, 'getUser', nick)['rank'];
    } catch (e) {
      rank = 0;
    }

    var postUserBlacklist = blacklist => {
      if (!blacklist) {
        return;
      }

      bot.blacklistVideo(uid);
    };

    var postValidate = (shouldDelete, why) => {
      if (!shouldDelete) {
        return bot.checkUserBlacklist(nick, postUserBlacklist);
      }

      switch (why) {
        case 'disabled':
          bot.logger.syslog.log('!~~! Emedding disabled: ' + id);
          bot.sendPM(nick, 'Embedding disabled: ' + id);
          break;

        case 'blocked':
          bot.logger.syslog.log(
              '!~~~! Video blocked in: ' + bot.deleteIfBlockedIn);
          bot.sendPM(
              nick,
              'Video blocked in: ' + bot.deleteIfBlockedIn + '. id: ' + id);
          break;

        case 'invalid':
          bot.logger.syslog.log('!~~~! Invalid video: ' + id);
          bot.sendPM(nick, 'Invalid video: ' + id);
          break;

        default:
          bot.logger.syslog.log('!~~~! Invalid video: ' + id);
          bot.sendPM(nick, 'Error: Video might not play. Deleting: ' + id);
          break;
      }

      return callback(true, uid);
    };

    var postUserBlock = (block) => {
      if (block) {
        bot.db.flagVideo(type, id, 1, title);
        bot.sendPM(nick, 'You\'re blocked from adding videos.');
        return callback(true, uid);
      }

      if (type === 'yt' && bot.youtubeapi) {
        validator.validate(bot, id, type, title, postValidate);
      } else {
        bot.checkUserBlacklist(nick, postUserBlacklist);
      }
    };

    var postVideoFlag = row => {
      if (row['flags'] === 2 && rank < 2) {
        bot.sendPM(nick, 'Video blocked: ' + title);
        return callback(true, uid);
      }
      bot.checkUserBlock(nick, postUserBlock);
    };

    if (nick.toLowerCase() !== this.username.toLowerCase()) {
      this.db.insertVideo(type, id, title, dur, nick);
    }

    // Start validation
    this.db.getVideoFlag(type, id, postVideoFlag);
  }

  // Updates the persistent settings
  updatePersistentSettings() {
    var changed = false
    if (!this.stats['hybridMods']) {
      changed = true;
      this.stats['hybridMods'] = {};
    }
    if (typeof this.stats['userLimit'] === 'undefined') {
      changed = true;
      this.stats['userLimit'] = false;
      this.stats['userLimitNum'] = 10;
    }
    if (typeof this.stats['disallow'] === 'undefined') {
      changed = true;
      this.stats['disallow'] = {};
    }

    if (Object.prototype.toString.call(this.stats['disallow']) ===
        '[object Object]') {
      var tempDisallow = [];
      for (var key in this.stats['disallow']) {
        if (this.stats['disallow'].hasOwnProperty(key)) {
          tempDisallow.push(key);
        }
      }
      this.stats['disallow'] = tempDisallow;
      changed = true;
    }

    if (changed) {
      this.writePersistentSettings();
    }
  }

  // Writes the persistent settings
  // Used by various methods
  writePersistentSettings() {
    var bot = this;
    this.logger.syslog.log('!~~~! Writing persistent settings');
    var stringyJSON = JSON.stringify(this.stats);
    fs.writeFile('persistent.json', stringyJSON, err => {
      if (err) {
        bot.logger.errlog.log(err);
        process.exit(1);
      }
    });
  }
}
