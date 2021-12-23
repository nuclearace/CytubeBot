import {exec} from 'child_process';

import {apiCall} from './apiclient.js';
import {handle as customHandle} from './custom.js';
import {handle as permissionsHandle} from './permissions.js';
import {handle as utilsHandle} from './utils.js';
import {validate} from './validate.js';

// See readme for chat commands
const chatHandlers = {
  'add': (bot, username, data, fromIRC) => {
    if (fromIRC || !data) {
      return;
    }

    bot.checkPermission(username, 2, 'A', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      let pos = 'end';
      const splitData = data.split(' ');

      const addFun = function(vid, pos) {
        if (vid['type'] === 'yt' && bot.youtubeapi) {
          validate(bot, vid['id'], vid['type'], null, (unplayable) => {
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
          data = splitData.join('');
        }
      }

      addFun(utilsHandle(bot, 'parseMediaLink', data), pos);
    });
  },

  'addrandom': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'R', (hasPermission) => {
      if (hasPermission && data <= 20) {
        bot.addRandomVideos(data);
      }
    });
  },

  'allow': (bot, username, data, fromIRC) => {
    if (!data || fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'M', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const match = data.match(/(\w*)/);

      if (!match) {
        return;
      }

      const user = match[1];
      const caller = utilsHandle(bot, 'getUser', username);

      if (user === bot.username) {
        return;
      }

      const postUserRank = (rank) => {
        bot.checkPermission(user, 2, 'M', (userAlsoHasPermission) => {
          const lesserOrEqualUser = user && caller.rank <= rank;

          if (lesserOrEqualUser && !userAlsoHasPermission) {
            return bot.disallowUser(user, false);
          } else if (lesserOrEqualUser && userAlsoHasPermission) {
            return;
          }

          return bot.disallowUser(user, false);
        });
      };
      bot.db.getUserRank(user, postUserRank);
    });
  },

  'anagram': (bot, username, msg) => {
    if ((new Date().getTime() - bot.timeSinceLastAnagram) / 1000 < 5) {
      return bot.sendPM(username, 'Anagram cooldown');
    }

    bot.timeSinceLastAnagram = new Date().getTime();
    if (msg.length < 7) {
      return bot.sendChatMsg('Message too short');
    } else if (msg.length > 30) {
      return bot.sendChatMsg('Message too long');
    }

    apiCall(msg, 'anagram', null, (resp) => {
      try {
        bot.sendChatMsg('[' + msg + '] -> ' + resp[1]);
      } catch (e) {
        bot.sendPM(username, 'There was a problem with the request');
      }
    });
  },

  'ask': (bot, username, msg) => {
    const answers = ['Yes', 'No'];
    const answer = answers[Math.floor(Math.random() * 2)];
    bot.sendChatMsg('[Ask: ' + msg + '] ' + answer);
  },

  'autodelete': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, null, (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      bot.blockVideo();
    });
  },

  'ban': (bot, username, data, fromIRC) => {
    if (!data || fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'N', (hasPermission) => {
      if (!hasPermission) {
        return;
      } else if (username.toLowerCase() === data.split(' ')[0].toLowerCase()) {
        return;
      }

      bot.sendChatMsg('/ban ' + data, true);
    });
  },

  'blacklist': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, null, (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      bot.blacklistVideo();
    });
  },

  'blacklistedusers': (bot) => {
    bot.listBlacklistedUsers();
  },

  'blacklistuser': (bot, username, data, fromIRC) => {
    if (typeof data === 'undefined' || fromIRC) {
      return;
    }

    bot.checkPermission(username, 3, null, (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const match = data.match(/(\w*) (true|false)/);

      if (!match) {
        return;
      }

      const user = match[1];
      let flag = match[2];

      if (user === bot.username) {
        return;
      }

      if (flag === 'true') {
        flag = true;
      } else {
        flag = false;
      }

      bot.blacklistUser(user, flag);
    });
  },

  'blockedusers': (bot) => {
    bot.listBlockedUsers();
  },

  'blockuser': (bot, username, data, fromIRC) => {
    if (fromIRC || !data) {
      return;
    }

    bot.checkPermission(username, 2, null, (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const match = data.match(/(\w*) (true|false)/);

      if (!match) {
        return;
      }

      const user = match[1];
      let flag = match[2];

      if (user === bot.username) {
        return;
      }

      if (flag === 'true') {
        flag = true;
      } else {
        flag = false;
      }

      bot.blockUser(user, flag);
    });
  },

  'bump': (bot, username, data, fromIRC) => {
    if (fromIRC || !data) {
      return;
    }

    bot.checkPermission(username, 2, 'B', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const bumpData = utilsHandle(bot, 'parseBumpData', data);

      if (!bumpData) {
        return;
      }

      utilsHandle(bot, 'genericUIDLoop', bumpData);
    });
  },

  'checkplaylist': (bot) => {
    bot.checkPlaylist();
  },

  'cleandatabasevideos': (bot, username) => {
    bot.checkPermission(username, 5, null, (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      bot.cleanDatabaseVideos();
    });
  },

  'choose': (bot, username, data) => {
    if (!data) {
      return;
    }

    const choices = data.trim().split(' ');
    const choice = choices[Math.floor(Math.random() * choices.length)];
    bot.sendChatMsg('[Choose: ' + choices.join(' ') + ' ] ' + choice);
  },

  'clearchat': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'M', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      bot.sendChatMsg('/clear', true);
    });
  },

  'currenttime': (bot) => {
    const currentTime = Math.round(bot.leaderData['currentTime']);
    bot.sendChatMsg('Current Time: ' + currentTime);
  },

  // Unlisted command
  'debuguserlist': (bot, username, data) => {
    if (data) {
      const user = utilsHandle(bot, 'getUser', data.trim());
      return console.log(user);
    }
    console.log(bot.userlist);
  },

  'delete': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    data = {
      userData: data,
      username: username,
    };

    bot.checkPermission(username, 2, 'D', (hasPermission) => {
      const deleteData = utilsHandle(bot, 'parseDeleteData', data);
      if (username.toLowerCase() === deleteData['name'].toLowerCase()) {
        utilsHandle(bot, 'genericUIDLoop', deleteData);
      } else if (hasPermission) {
        utilsHandle(bot, 'genericUIDLoop', deleteData);
      }
    });
  },

  'deletevideos': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 5, null, (hasPermission) => {
      if (!hasPermission) {
        return;
      }
      bot.deleteVideosFromDatabase(data);
    });
  },

  'disallow': (bot, username, data, fromIRC) => {
    if (!data || fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'M', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const match = data.match(/(\w*)/);
      if (!match) {
        return;
      }

      const user = match[1].toLowerCase();
      const caller = utilsHandle(bot, 'getUser', username);

      if (user === bot.username) {
        return;
      }

      const postUserRank = function(rank) {
        bot.checkPermission(user, 2, 'M', (userAlsoHasPermission) => {
          const lesserOrEqualUser = user && caller.rank <= rank;

          if (lesserOrEqualUser && !userAlsoHasPermission) {
            return bot.disallowUser(user, true);
          } else if (lesserOrEqualUser && userAlsoHasPermission) {
            return;
          }

          return bot.disallowUser(user, true);
        });
      };
      bot.db.getUserRank(user, postUserRank);
    });
  },

  'duplicates': (bot, username, data, fromIRC) => {
    if (fromIRC || bot.playlist.length === 0) {
      return;
    }

    bot.checkPermission(username, 2, 'D', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const lookedUp = [];
      let numDeleted = 0;
      const inLookedUp = (vid) => {
        for (let k = 0; k < lookedUp.length; k++) {
          if (lookedUp[k]['id'] === vid['media']['id'] &&
              lookedUp[k]['type'] === vid['media']['type']) {
            return true;
          }
        }
        return false;
      };

      const duplicateUIDs = bot.playlist.map((video) => {
        if (inLookedUp(video)) {
          return video['uid'];
        } else {
          lookedUp.push({
            id: video['media']['id'],
            type: video['media']['type'],
          });
        }
      });

      // Fix duplicateUIDs
      duplicateUIDs.forEach((vid, index) => {
        numDeleted++;
        if (typeof duplicateUIDs[index] === 'undefined') {
          numDeleted--;
          return duplicateUIDs.splice(index, 1);
        }
      });

      const deleteData = {
        'kind': 'deleteVideo',
        'num': 'all',
        'uids': duplicateUIDs.reverse(),
      };

      utilsHandle(bot, 'genericUIDLoop', deleteData);
      bot.sendChatMsg('Deleted: ' + numDeleted);
    });
  },

  'emotes': (bot) => {
    if (!bot.enableWebServer) {
      return bot.sendChatMsg('WebServer not enabled');
    }

    bot.sendChatMsg(bot.webURL + ':' + bot.webPort + '/emotes');
  },

  'forecast': (bot, username, data) => {
    if (bot.muted || !bot.weatherunderground || !data) {
      return;
    }

    const now = Date.now();
    const waitTime = ((bot.weatherLimiter.curIntervalStart +
                       bot.weatherLimiter.tokenBucket.interval) -
                      now) /
        1000;

    if (bot.weatherLimiter.getTokensRemaining() < 1) {
      bot.sendChatMsg(
          'Too many requests sent. Available in: ' + waitTime + ' seconds');
      return;
    }

    const tomorrow = data.match('tomorrow');
    if (tomorrow) {
      data = data.replace(/tomorrow/ig, '');
    }

    const postAPI = (resp) => {
      const parsedJSON = JSON.parse(resp);
      if (parsedJSON['response']['error'] ||
          parsedJSON['response']['results']) {
        return bot.sendChatMsg('Error');
      }

      const forecastData = {
        json: parsedJSON,
        tomorrow: tomorrow,
      };

      const forecastStrings =
          utilsHandle(bot, 'parseForecastData', forecastData);

      // Send the forecast
      forecastStrings.forEach((string) => bot.sendChatMsg(string));
    };

    bot.weatherLimiter.removeTokens(
        1, () => apiCall(data, 'forecast', bot.weatherunderground, postAPI));
  },

  'help': (bot) => {
    bot.sendChatMsg(
        'https://github.com/airforce270/CytubeBot/blob/master/README.md#commands');
  },

  'internals': (bot) => {
    if (!bot.enableWebServer) {
      return bot.sendChatMsg('WebServer not enabled');
    }

    bot.sendChatMsg(bot.webURL + ':' + bot.webPort + '/internals');
  },

  'ipban': (bot, username, data, fromIRC) => {
    if (!data || fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'N', (hasPermission) => {
      if (!hasPermission) {
        return;
      } else if (username.toLowerCase() === data.toLowerCase()) {
        return;
      }

      bot.sendChatMsg('/ipban ' + data, true);
    });
  },

  'kick': (bot, username, data, fromIRC) => {
    if (!data || fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'I', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      bot.sendChatMsg('/kick ' + data, true);
    });
  },

  'listpermissions': (bot, username, data) => {
    let name;
    if (!data) {
      name = username;
    } else {
      name = data;
    }

    permissionsHandle(bot, 'sendHybridModPermissions', name.toLowerCase());
  },

  'management': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'G', (hasPermission) => {
      if (hasPermission && data.indexOf('on') !== -1) {
        bot.logger.syslog.log('!~~~! Bot is now managing the playlist');
        bot.stats['managing'] = true;
        bot.writePersistentSettings();
      } else if (hasPermission && data.indexOf('off') !== -1) {
        bot.logger.syslog.log(
            '!~~~! The bot is no longer managing the playlist');
        bot.stats['managing'] = false;
        bot.writePersistentSettings();
      }

      if (bot.playlist.length === 0 && bot.stats['managing']) {
        bot.addRandomVideos();
      }
    });
  },

  'mute': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'M', (hasPermission) => {
      if (hasPermission && !bot.stats['muted']) {
        bot.stats['muted'] = !bot.stats['muted'];
        bot.logger.syslog.log('!~~~! ' + username + ' muted bot');
        bot.writePersistentSettings();
      }
    });
  },

  'unmute': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'M', (hasPermission) => {
      if (hasPermission && bot.stats['muted']) {
        bot.stats['muted'] = !bot.stats['muted'];
        bot.logger.syslog.log('!~~~! ' + username + ' unmuted bot');
        bot.writePersistentSettings();
      }
    });
  },

  'permissions': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 3, null, (hasPermission) => {
      const match = data.trim().match(/^((\+|\-)((ALL)|(.*)) )?(.*)$/);
      let permission = match[1];
      const name = match[6].toLowerCase();

      if (!hasPermission) {
        return;
      } else if (permission) {
        permission = permission.toUpperCase();
      }

      bot.handleHybridModPermissionChange(permission, name);
    });
  },

  // Unlisted command
  'playlistdebug': (bot, username, data) => {
    if (data) {
      return console.log(bot.playlist[data]);
    }

    console.log(bot.playlist);
  },

  'poll': (bot, username, data, fromIRC) => {
    if (!data || fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'P', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      let hidden = false;
      const splitData = data.split('.');
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
  },

  'endpoll': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'P', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      bot.endPoll();
    });
  },

  'processinfo': (bot) => {
    const info = process.memoryUsage();
    bot.sendChatMsg(
        'Heap total: ' + info['heapTotal'] + ' Heap used: ' + info['heapUsed']);
  },

  'purge': (bot, username, data, fromIRC) => {
    if (!data) {
      data = username;
    }

    data = data.trim() + ' all';
    chatHandlers.delete(bot, username, data, fromIRC);
  },

  'quote': function(bot, username, nick) {
    bot.getQuote(nick);
  },

  'restart': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'K', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      // Someone wants this to die
      if (data) {
        bot.sendChatMsg('[kill] ' + data);
        setTimeout(() => {
          process.exit(0);
        }, 500);
      } else {
        process.exit(0);
      }
    });
  },

  'settime': (bot, username, data, fromIRC) => {
    if (fromIRC || !data) {
      return;
    }

    bot.checkPermission(username, 2, 'T', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const parsedTime = data.match(/(\+|\-)?(\d*)/);
      const plusMinus = parsedTime[1];
      let time = parseInt(parsedTime[2]);

      if (isNaN(time)) {
        return bot.sendPM(username, 'Time given is not a number');
      } else if (bot.sendAssignLeader(bot.username)) {
        return bot.logger.cytubelog.log(
            '!~~~! Cannot set leader: Insufficient rank');
      }

      if (plusMinus) {
        if (plusMinus === '+') {
          time = bot.leaderData['currentTime'] + time;
        }

        if (plusMinus === '-') {
          time = bot.leaderData['currentTime'] - time;
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
  },

  'shuffle': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'U', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      bot.shufflePlaylist();
    });
  },

  'skip': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'S', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      bot.deleteVideo(bot.currentUID);
    });
  },

  // Shows basic database stats
  'stats': (bot) => {
    bot.getGeneralStats();
    if (bot.enableWebServer) {
      bot.sendChatMsg(bot.webURL + ':' + bot.webPort + '/');
    }
  },

  'status': (bot, username) => {
    if ((new Date().getTime() - bot.timeSinceLastStatus) / 1000 < 120) {
      return bot.sendPM(username, 'Status cooldown');
    }

    bot.timeSinceLastStatus = new Date().getTime();
    bot.sendStatus();
  },

  'talk': (bot, username, msg) => {
    if ((new Date().getTime() - bot.timeSinceLastTalk) / 1000 < 5) {
      return bot.sendPM(username, 'Talk cooldown');
    }

    bot.timeSinceLastTalk = new Date().getTime();
    bot.talk(msg, (resp) => bot.sendChatMsg(resp));
  },

  'translate': (bot, username, data) => {
    if (!data) {
      return;
    }

    if ((new Date().getTime() - bot.timeSinceLastTranslate) / 1000 < 5) {
      return bot.sendChatMsg('Translate cooldown');
    }

    bot.timeSinceLastTranslate = new Date().getTime();
    const groups =
        data.match(/^(\[(([A-z]{2})|([A-z]{2}) ?-?> ?([A-z]{2}))\] ?)?(.+)$/);

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
    apiCall(query, 'translate', (err, res) => {
      if (err) {
        return bot.sendChatMsg(err);
      }
      bot.sendChatMsg(
          '[' + res.from.language.iso + '->' + to + '] ' + res.text);
    });
  },  // End translate

  'unban': (bot, username, data, fromIRC) => {
    if (!data || fromIRC) {
      return;
    }

    bot.checkPermission(username, 2, 'N', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const unbanFun = (callback) => {
        for (let i = 0; i < bot.banlist.length; i++) {
          if (bot.banlist[i]['name'].toLowerCase() === data.toLowerCase()) {
            const unbanJSON = {
              id: bot.banlist[i]['id'],
              name: bot.banlist[i]['name'],
            };
            bot.sendUnban(unbanJSON);
          }
        }
        callback();
      };

      // Create an object that will be used to execute the unban when we
      // get the banlist
      const unbanObject = {
        unban: true,
        fun: unbanFun,
      };

      // add to the waitlist
      bot.waitingFunctions.push(unbanObject);
      bot.socket.emit('requestBanlist');
    });
  },

  // Experimental
  // Only use if bot was installed with git
  // Executes git pull
  'update': (bot, username, data, fromIRC) => {
    if (fromIRC) {
      return;
    }

    bot.db.getUserRank(username, (rank) => {
      if (rank < 5) {
        return;
      }

      exec('git pull', (error, stdout, stderr) => {
        stdout = stdout.replace(/\+/g, '');
        stdout = stdout.replace(/\-/g, '');
        stdout = stdout.replace(/\(/g, '');
        stdout = stdout.replace(/\)/g, '');
        if (stdout.toLowerCase() === 'already uptodate.\n') {
          return bot.sendChatMsg('Already up-to-date.');
        }

        bot.sendChatMsg(stdout);

        if (stdout.length > 20) {
          setTimeout(() => {
            process.exit(0);
          }, 2000);
        }
      });
    });
  },

  'userlimit': (bot, username, data, fromIRC) => {
    if (!data || fromIRC) {
      return;
    }

    bot.checkPermission(username, 3, 'L', (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const userlimitData = {
        match: data.match(/^(true|false) ?(\d*)|(\d*)/),
        callback: () => {
          bot.checkPlaylist();
          bot.writePersistentSettings();
        },
      };

      utilsHandle(bot, 'parseUserlimit', userlimitData);
    });
  },

  'weather': (bot, username, data) => {
    if (!bot.weatherunderground) {
      return bot.sendChatMsg('No weatherunderground API key!');
    } else if (!data || bot.muted) {
      return;
    }

    const now = Date.now();
    const waitTime = ((bot.weatherLimiter.curIntervalStart +
                       bot.weatherLimiter.tokenBucket.interval) -
                      now) /
        1000;

    if (bot.weatherLimiter.getTokensRemaining() < 1) {
      bot.sendChatMsg(
          'Too many requests sent. Available in: ' + waitTime + ' seconds');
      return;
    }

    const postAPI = (resp) => {
      const parsedJSON = JSON.parse(resp);
      if (parsedJSON['response']['error'] ||
          parsedJSON['response']['results']) {
        return bot.sendChatMsg('Error');
      }

      const location =
          parsedJSON['current_observation']['display_location']['full'];
      const tempF = parsedJSON['current_observation']['temp_f'];
      const tempC = parsedJSON['current_observation']['temp_c'];
      const date = parsedJSON['current_observation']['observation_time'];
      const weather = parsedJSON['current_observation']['weather'];

      bot.sendChatMsg(
          `Currently ${weather} and ${tempF}F (${tempC}C) ` +
          `in ${location}. ${date}`);
    };

    bot.weatherLimiter.removeTokens(1, () => {
      apiCall(data, 'weather', bot.weatherunderground, postAPI);
    });
  },

  'wolfram': (bot, username, query) => {
    if (!bot.wolfram) {
      return bot.sendChatMsg('No wolfram API key!');
    }

    if (bot.wolframLimiter.getTokensRemaining() < 1) {
      return bot.sendChatMsg('Wolfram allowance used up for the day');
    }

    apiCall(query, 'wolfram', bot.wolfram, (result) => bot.sendChatMsg(result));
  },
};

export function handle(bot, username, msg, fromIRC) {
  const split = msg.split(' ');
  let command = String(split.splice(0, 1));
  command = command.substring(1, command.length);
  const rest = split.join(' ');

  if (command in chatHandlers) {
    return chatHandlers[command](bot, username, rest, fromIRC);
  }

  // Goto custom commands if we can't find one here
  return customHandle(bot, username, msg, fromIRC);
}
