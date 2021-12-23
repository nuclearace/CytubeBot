import {parallel} from 'async';
import sqlite3 from 'sqlite3';

import {errlog, syslog} from './logger.js';


export class Database {
  constructor(maxVideoLength) {
    this.db = new sqlite3.Database('./cytubebot.db');
    this.maxVideoLength = maxVideoLength;
    this.createTables();
  }


  // Creates the tables if they do not exist
  createTables() {
    this.db.serialize();
    this.db.run(
        'CREATE TABLE IF NOT EXISTS ' +
        'users(uname TEXT, blacklisted TEXT, block TEXT, PRIMARY KEY(uname))');
    this.db.run(
        'CREATE TABLE IF NOT EXISTS ' +
        'chat(timestamp INTEGER, username TEXT, msg TEXT, channel TEXT)');
    this.db.run(
        'CREATE TABLE IF NOT EXISTS ' +
        'videos(type TEXT, id TEXT, duration_ms INTEGER, title TEXT, ' +
        'flags INTEGER, PRIMARY KEY(type, id))');
    this.db.run(
        'CREATE TABLE IF NOT EXISTS ' +
        'video_stats(type TEXT, id TEXT, uname TEXT)');
    this.db.run(
        'CREATE TABLE IF NOT EXISTS ' +
        'user_count(timestamp INTEGER, count INTEGER, ' +
        'PRIMARY KEY(timestamp, count))');
    this.db.run(
        'CREATE TABLE IF NOT EXISTS ' +
        'version(key TEXT, value TEXT, PRIMARY KEY(key))');

    this.updateTables();
  }

  // Updates the tables as needed
  updateTables() {
    this.getVersion((version) => {
      if (!version) {
        const update = this.db.prepare(
            'INSERT INTO version(key, value) VALUES (?, ?)',
            ['dbversion', '1']);
        update.run(() => {
          this.db.run('ALTER TABLE users ADD rank INTEGER');
          this.db.parallelize();
        });
      }
    });
  }

  // Sets a flag on a video
  // type - The video type eg. "yt"
  // id - The ID of the video
  // flags - The flag, should be 1
  // title - Title of the video
  flagVideo(type, id, flags, title) {
    syslog.log('*** Flagging video: ' + title + ' with flag: ' + flags);

    const stmt = this.db.prepare(
        'UPDATE videos SET flags = ? WHERE type = ? AND id = ?',
        [flags, type, id]);
    stmt.run();

    stmt.finalize();
  }

  // WARNING - This is experimental
  // Deletes videos from the database that are like like
  // We serialize the database to stop the final getVideosCount from executing
  // before the other queries have run
  // like - What to match. Example: %skrillex% will delete all videos
  // with the word "skrillex" in it
  // callback - The callback function, sends a chatMsg with how many videos
  // we deleted
  deleteVideos(like, callback) {
    syslog.log('*** Deleting videos where title like ' + like);
    let before = 0;
    let after = 0;
    let videoIds = {};

    const getAfter = () => {
      this.getVideosCount((num) => {
        after = num;
        callback(before - after);
      });
    };

    const deleteVideos = () => {
      for (let i = 0; i < videoIds.length; i++) {
        const stmt1 = this.db.prepare(
            'DELETE FROM videos WHERE id = ? ' +
                'AND type = ?',
            [videoIds[i]['id'], videoIds[i]['type']]);
        const stmt2 = this.db.prepare(
            'DELETE FROM video_stats WHERE id = ? AND type = ?',
            [videoIds[i]['id'], videoIds[i]['type']]);

        stmt1.run();
        stmt2.run();
      }
      getAfter();
    };

    const getVideoIds = () => {
      this.db.all(
          'SELECT id, type FROM videos WHERE title LIKE ? AND flags = 0', like,
          (err, rows) => {
            if (err) {
              return;
            }
            videoIds = rows;
            deleteVideos();
          });
    };

    const start = () => {
      this.getVideosCount((num) => {
        before = num;
        getVideoIds();
      });
    };

    // Lets get on the ride
    this.db.serialize(start);
  }

  // Inserts a chatMsg into the chat table
  // msg - The message that we are inserting
  // time - The timestamp of the message
  // nick - The user who said it
  // room - The room in which it was said
  insertChat(msg, time, nick, room) {
    const stmt = this.db.prepare(
        'INSERT INTO chat VALUES(?, ?, ?, ?)', [time, nick, msg, room]);
    stmt.run();

    stmt.finalize();
  }

  // Inserts a video into the database
  // site - The type of video eg. "yt"
  // vid - The ID of the video
  // title - The title of the video
  // dur - The duration of the video
  // nick - The user who added the video
  insertVideo(site, vid, title, dur, nick) {
    syslog.log('*** Inserting: ' + title + ' into the database');

    const stmt1 = this.db.prepare(
        'INSERT OR IGNORE INTO videos VALUES(?, ?, ?, ?, ?)',
        [site, vid, dur * 1000, title, 0]);
    const stmt2 = this.db.prepare(
        'INSERT INTO video_stats VALUES(?, ?, ?)', [site, vid, nick]);

    stmt1.run();
    stmt1.finalize();

    stmt2.run();
    stmt2.finalize();
  }

  // Inserts a user into the user table
  // username - The user we are adding
  // rank - The users rank
  insertUser(username, rank) {
    if (!username) {
      return;
    }

    const stmt = this.db.prepare(
        'INSERT OR IGNORE INTO users VALUES (?, \'false\', \'false\', ?)',
        [username, rank]);
    stmt.run();

    stmt.finalize();
  }

  // Sets the blacklisted flag on the user table
  // username - The user we are setting the flag on
  // flag - The flag to set
  // callback - The callback function
  insertUserBlacklist(username, flag, callback) {
    syslog.log('Setting blacklist: ' + flag + ' on user: ' + username);

    const stmt = this.db.prepare(
        'UPDATE users SET blacklisted = ? WHERE uname = ?', [flag, username]);
    stmt.run(callback);
  }

  // Sets the block column of user
  // user - The user
  // flag - The value
  insertUserBlock(username, flag, callback) {
    syslog.log('*** Setting block: ' + flag + ' on user: ' + username);
    const stmt = this.db.prepare(
        'UPDATE users SET block = ? WHERE uname = ?', [flag, username]);

    stmt.run(callback);
  }

  // Handles changes to a user's rank
  // user - The user whose rank we are changing
  // rank - The rank to set
  insertUserRank(username, rank) {
    const stmt = this.db.prepare(
        'UPDATE users SET rank = ? WHERE uname = ?', [rank, username]);
    stmt.run();
  }

  // Inserts the usercount, from a usercount frame
  // count - The number of users at timestamp
  // timestamp - The time the frame was sent
  insertUsercount(count, timestamp) {
    const stmt = this.db.prepare(
        'INSERT INTO user_count VALUES(?, ?)', [timestamp, count]);
    stmt.run();
  }

  // Gets all the users with a blacklist
  // callback - The callback function
  getAllBlacklistedUsers(callback) {
    const stmt =
        this.db.prepare('SELECT uname FROM users WHERE blacklisted = \'1\'');
    const users = [];

    stmt.all((err, rows) => {
      if (rows) {
        for (let i = 0; i < rows.length; i++) {
          users.push(rows[i]['uname']);
        }
        callback(users);
      }
    });
  }

  // Gets all the blocked users
  getAllBlockedUsers(callback) {
    const stmt = this.db.prepare('SELECT uname FROM users WHERE block = \'1\'');
    const users = [];

    stmt.all((err, rows) => {
      if (rows) {
        for (let i = 0; i < rows.length; i++) {
          users.push(rows[i]['uname']);
        }
        callback(users);
      }
    });
  }

  // Gets the usercounts for the average users chart
  // Basically ported from naoko
  // callback - The callback function
  getAverageUsers(callback) {
    const sql = `
        SELECT STRFTIME('%s',
                    STRFTIME('%Y-%m-%dT%H:00', timestamp / 1000, 'UNIXEPOCH')
                  ) * 1000 AS timestamp,
                CAST(ROUND(AVG(count)) AS INTEGER) AS count
        FROM user_count

        GROUP BY STRFTIME('%Y%m%d%H', timestamp / 1000, 'UNIXEPOCH')
      `;

    const stmt = this.db.prepare(sql);
    const returnData = [];

    stmt.all((err, rows) => {
      if (err) {
        return;
      }

      // Format data for google charts
      for (let i = 0; i < rows.length; i++) {
        returnData.push([rows[i]['timestamp'], rows[i]['count']]);
      }
      callback(null, returnData);
    });
  }

  // Gets the amount of messages by each user
  // Used for the chat stats chart
  // callback - The callback function
  getChatStats(callback) {
    const sql = `
        SELECT username, count(*) as count
        FROM chat
        GROUP BY username
        ORDER BY count(*) DESC
      `;
    const stmt = this.db.prepare(sql);
    const returnData = [];

    stmt.all((err, rows) => {
      if (err) {
        return;
      }

      // Format data for google charts
      for (let i = 0; i < rows.length; i++) {
        if (rows[i]['username'] !== '') {
          returnData.push([rows[i]['username'], rows[i]['count']]);
        }
      }
      callback(null, returnData);
    });
  }

  // Does ANALYZE on the database
  // Used to get the counts of videos, users, and chat
  // callback - The callback function
  getGeneralStats(callback) {
    const stmt = 'ANALYZE';
    const stmt2 = `
        SELECT stat
        FROM sqlite_stat1
        WHERE tbl = 'users'
          OR tbl = 'videos'
          OR tbl = 'chat'
      `;

    this.db.serialize(() => {
      this.db.run(stmt);
      this.db.all(stmt2, (err, rows) => {
        if (rows) {
          callback(rows);
        }
      });
    });
  }

  // Gets the 10 most popular videos
  // Used for the popular videos chart
  // callback - The callback function
  getPopularVideos(callback) {
    const sql = `
        SELECT videos.type,
                videos.id,
                videos.title,
                videos.flags & 1,
                count(*) AS count

        FROM videos, video_stats

        WHERE video_stats.type = videos.type
          AND video_stats.id = videos.id
          AND NOT videos.flags & 2

        GROUP BY videos.type, videos.id

        ORDER BY count(*) DESC

        LIMIT 10
      `;

    const stmt = this.db.prepare(sql);

    const returnData = [];

    stmt.all((err, rows) => {
      if (err) {
        return;
      }

      // Format data for google charts
      for (let i = 0; i < rows.length; i++) {
        returnData.push([
          rows[i]['type'],
          rows[i]['id'],
          rows[i]['title'],
          rows[i]['flags'],
          rows[i]['count'],
        ]);
      }
      callback(null, returnData);
    });
  }

  // Gets a chat message
  // If nick is given, it will select a quote from that user
  // If no nick is given, it will select a random quote
  // nick - The username we are getting a quote for
  // callback - The callback function
  getQuote(nick, callback) {
    nick = nick.split(' ')[0];
    let stmt = {};

    if (nick) {
      stmt = this.db.prepare(
          'SELECT username, msg, timestamp FROM chat WHERE ' +
              'username = ? COLLATE NOCASE ORDER BY RANDOM() LIMIT 1',
          [nick]);

      stmt.get((err, row) => {
        if (row) {
          return callback(row);
        }
      });
      return callback(0);
    }

    stmt = `
        SELECT username,
                msg,
                timestamp
        FROM chat
        WHERE msg NOT LIKE '/me%'
          AND msg NOT LIKE '$%'
        ORDER BY RANDOM()
        LIMIT 1
      `;
    this.db.get(stmt, (err, row) => {
      if (row) {
        callback(row);
      }
    });
  }

  // Fetches all of the stats required by the stats page
  // Functions are chained together with the last function
  // giving the callback the final returnData object
  // room - The room the bot is currently in
  // callback - The callback function
  getStats(room, callback) {
    // Lets go on another ride
    parallel(
        {
          userVideoStats: this.getVideoStats.bind(this),
          userChatStats: this.getChatStats.bind(this),
          popularVideos: this.getPopularVideos.bind(this),
          averageUsers: this.getAverageUsers.bind(this),
        },
        (err, results) => {
          if (err) {
            return;
          }

          results['room'] = room;
          callback(results);
        });
  }

  // Checks whether a user is blacklisted
  // username - The user we are checking
  // callback - The callback function
  getUserBlacklist(username, callback) {
    const stmt = this.db.prepare(
        'SELECT blacklisted FROM users WHERE uname = ?', [username]);

    stmt.get((err, row) => {
      if (typeof row !== 'undefined') {
        callback(row['blacklisted']);
      }
    });
  }

  // Selects the autodelete column for user
  // username - The user we are looking up
  // callback - Callback function
  getUserBlock(username, callback) {
    const stmt =
        this.db.prepare('SELECT block FROM users WHERE uname = ?', [username]);

    stmt.get((err, row) => {
      if (typeof row !== 'undefined') {
        callback(row['block']);
      }
    });
  }

  // Gets a user's rank
  // Callback - callback function
  getUserRank(username, callback) {
    const stmt =
        this.db.prepare('SELECT rank FROM users WHERE uname = ?', [username]);

    stmt.get((err, row) => {
      if (typeof row !== 'undefined') {
        callback(row['rank']);
      }
    });
  }

  // Gets the database version
  getVersion(callback) {
    const stmt =
        this.db.prepare('SELECT value FROM version WHERE key = \'dbversion\'');

    stmt.get((err, row) => {
      if (row === undefined) {
        callback(null);
      } else {
        callback(row);
      }
    });
  }

  // Used by the addRandom() method
  // Fetches num random videos, if num is zero it fetches 1 video
  // Limits videos to those under 10 minutes and whose type is yt, dm, or vm
  // num - The number of videos we are getting
  // callback - The callback function
  getVideos(num, callback) {
    if (!num) {
      num = 1;
    }

    const sql = `
        SELECT type,
                id,
                duration_ms,
                title

        FROM videos

        WHERE flags = 0
          AND duration_ms < ?
          AND (type = 'yt' OR type = 'dm' OR type = 'vm')

        ORDER BY RANDOM()

        LIMIT ?
      `;

    const stmt = this.db.prepare(sql, [this.maxVideoLength, num]);

    stmt.all((err, rows) => {
      callback(rows);
    });
  }

  getVideosCountForClean(callback) {
    this.db.get(
        'SELECT count(*) AS count FROM videos WHERE flags = 0 ' +
            'AND type = \'yt\' AND duration_ms < ?',
        [this.maxVideoLength], (err, row) => {
          if (err) {
            return errlog.log(err);
          }

          callback(row['count']);
        });
  }

  // Gets the number of videos in the database
  // callback - The callback function
  getVideosCount(callback) {
    this.db.get('SELECT count(*) AS count FROM videos', (err, row) => {
      if (err) {
        return errlog.log(err);
      }

      callback(row['count']);
    });
  }

  // Gets the number of videos added by each user
  // Used by the video by user chart
  // callback - The callback function
  getVideoStats(callback) {
    const sql = `
        SELECT uname, count(*) AS count
        FROM video_stats vs, videos v
        WHERE vs.type = v.type
          AND vs.id = v.id
          AND NOT v.flags & 2
        GROUP BY uname
        ORDER BY count(*) DESC
      `;

    const stmt = this.db.prepare(sql);
    const returnData = [];

    stmt.all((err, rows) => {
      if (err) {
        return;
      }

      // Format data for google charts
      for (let i = 0; i < rows.length; i++) {
        if (rows[i]['uname'] !== '') {
          returnData.push([rows[i]['uname'], rows[i]['count']]);
        }
      }

      callback(null, returnData);
    });
  }

  // Gets the flag of a video
  // type - The type of the video we are looking up
  // id - The ID of the video we are looking up
  // callback - The callback function
  getVideoFlag(type, id, callback) {
    const stmt = this.db.prepare(
        'SELECT flags FROM videos videos WHERE type = ? AND id = ?',
        [type, id]);

    stmt.get((err, row) => {
      if (row) {
        callback(row);
      } else {
        callback(0);
      }
    });
  }
}
