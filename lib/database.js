import {parallel} from 'async';
import sqlite3 from 'sqlite3';

import {auditLog, errorLog, infoLog} from './logger.js';
import {dbRun, dbRunStatement, getCurrentUnixTimestamp} from './utils.js';


/**
 * A user on the leaderboard.
 *
 * @typedef {Object} LeaderboardUser
 * @property {string} name Name of the user on the leaderboard.
 * @property {string} points Number of points that user has.
 */

/**
 * A tempbanned user.
 *
 * @typedef {Object} TempBannedUser
 * @property {string} name Name of a tempbanned user.
 * @property {number} end The Unix timestamp (seconds) when the user's tempban ends.
 */

/**
 * A timed out user.
 *
 * @typedef {Object} TimedOutUser
 * @property {string} name Name of a timed out user.
 * @property {number} end The Unix timestamp (seconds) when the user's timeout ends.
 */


export class Database {
  constructor(maxVideoLength) {
    this.db = new sqlite3.Database('./cytubebot.db');
    this.maxVideoLength = maxVideoLength;
    this.createTables();
    this.updateTables();
  }

  /** Creates the tables if they do not exist. */
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
    this.db.run(
        'CREATE TABLE IF NOT EXISTS ' +
        'modules(name TEXT, enabled TEXT, PRIMARY KEY(name))');
  }

  /** Updates the tables as needed. */
  async updateTables() {
    await this.updateDbVersion(1, async () => {
      await dbRun(this.db, 'ALTER TABLE users ADD rank INTEGER');
      await new Promise((resolve, reject) => this.db.parallelize(resolve));
    });
    await this.updateDbVersion(2, async () => {
      await dbRun(this.db, 'ALTER TABLE users ADD suspended_until_unix INTEGER DEFAULT 0');
    });
    await this.updateDbVersion(3, async () => {
      await dbRun(this.db, 'ALTER TABLE users ADD points INTEGER DEFAULT 0');
    });
    await this.updateDbVersion(4, async () => {
      await dbRun(this.db, 'ALTER TABLE users ADD timed_out_until_unix INTEGER DEFAULT 0');
    });
  }

  /**
   * Update the DB and increment its version.
   *
   * @param {number} newVersion New version to create.
   * @param {!Function} updateFunc Function to run to perform updates.
   */
  async updateDbVersion(newVersion, updateFunc) {
    const version = await this.getVersion();
    const dbVersion = version ? parseInt(version, 10) : 0;
    if (newVersion <= dbVersion) {
      return;
    }

    infoLog.log(`Updating db to version ${newVersion}`);
    await updateFunc();

    // Special case to create the version row if it doesn't exist
    if (dbVersion === 0) {
      await dbRun(this.db, `INSERT INTO version(key, value) VALUES ('dbversion', 1)`);
    }

    await dbRunStatement(
        this.db.prepare(`UPDATE version SET value = ? WHERE key = 'dbversion'`, [newVersion]));
  }

  /**
   * Sets a flag on a video.
   *
   * @param {string} type The video type eg. "yt".
   * @param {string} id The ID of the video.
   * @param {number} flags The flag, should be 1.
   * @param {string} title Title of the video.
   */
  flagVideo(type, id, flags, title) {
    auditLog.log(`*** Flagging video: ${title} with flag: ${flags}`);

    const statement =
        this.db.prepare('UPDATE videos SET flags = ? WHERE type = ? AND id = ?', [flags, type, id]);
    statement.run();

    statement.finalize();
  }

  /**
   * Deletes videos from the database that are like `like`.
   *
   * We serialize the database to stop the final getVideosCount from executing
   * before the other queries have run.
   *
   * WARNING - This is experimental!
   *
   * @param {string} like What to match. Example: %skrillex% will delete all
   *     videos with the word "skrillex" in it.
   * @param {!Function} callback The callback function, sends a chatMsg with how
   *     many videos we deleted.
   */
  deleteVideos(like, callback) {
    auditLog.log(`*** Deleting videos where title like ${like}`);
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
        const statement1 = this.db.prepare(
            'DELETE FROM videos WHERE id = ? AND type = ?', [videoIds[i].id, videoIds[i].type]);
        const statement2 = this.db.prepare(
            'DELETE FROM video_stats WHERE id = ? AND type = ?',
            [videoIds[i].id, videoIds[i].type]);

        statement1.run();
        statement2.run();
      }
      getAfter();
    };

    const getVideoIds = () => {
      this.db.all(
          'SELECT id, type FROM videos WHERE title LIKE ? AND flags = 0', like, (err, rows) => {
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

    this.db.serialize(start);
  }

  /**
   * Inserts a chatMsg into the chat table.
   *
   * @param {string} msg The message that we are inserting.
   * @param {number} time The timestamp of the message.
   * @param {string} nick The user who said it.
   * @param {string} room The room in which it was said.
   */
  insertChat(msg, time, nick, room) {
    const statement =
        this.db.prepare('INSERT INTO chat VALUES(?, ?, ?, ?)', [time, nick, msg, room]);
    statement.run();

    statement.finalize();
  }

  /**
   * Inserts a video into the database.
   *
   * @param {string} site The type of video eg. "yt".
   * @param {string} vid The ID of the video.
   * @param {string} title The title of the video.
   * @param {number} dur The duration of the video.
   * @param {string} nick The user who added the video.
   */
  insertVideo(site, vid, title, dur, nick) {
    auditLog.log(`*** Inserting: ${title} into the database`);

    const statement1 = this.db.prepare(
        'INSERT OR IGNORE INTO videos VALUES(?, ?, ?, ?, ?)', [site, vid, dur * 1000, title, 0]);
    const statement2 =
        this.db.prepare('INSERT INTO video_stats VALUES(?, ?, ?)', [site, vid, nick]);

    statement1.run();
    statement1.finalize();

    statement2.run();
    statement2.finalize();
  }

  /**
   * Inserts a user into the user table.
   *
   * @param {string} username The user we are adding.
   * @param {string} rank The user's rank.
   */
  insertUser(username, rank) {
    if (!username) {
      return;
    }

    const sql = `
        INSERT OR IGNORE INTO
          users(uname, blacklisted, block, rank)

        VALUES (?, 'false', 'false', ?)
      `;
    const statement = this.db.prepare(sql, [username, rank]);
    statement.run();

    statement.finalize();
  }

  /**
   * Sets the blacklisted flag on the user table.
   *
   * @param {string} username The user we are setting the flag on.
   * @param {boolean} flag The flag to set.
   * @return {!Promise<void>} Promise indicating the operation's success.
   */
  insertUserBlacklist(username, flag) {
    auditLog.log(`Setting blacklist: ${flag} on user: ${username}`);
    const statement = this.db.prepare(
        'UPDATE users SET blacklisted = ? WHERE LOWER(uname) = ?',
        [flag.toLowerCase(), username.toLowerCase()]);
    return dbRunStatement(statement);
  }

  /**
   * Sets the block column of user.
   *
   * @param {string} username The user.
   * @param {boolean} flag The value.
   * @return {!Promise<void>} Promise indicating the operation's success.
   */
  insertUserBlock(username, flag) {
    auditLog.log(`*** Setting block: ${flag} on user: ${username}`);
    const statement = this.db.prepare(
        'UPDATE users SET block = ? WHERE uname = ?', [flag.toLowerCase(), username.toLowerCase()]);
    return dbRunStatement(statement);
  }

  /**
   * Handles changes to a user's rank.
   *
   * @param {string} username The user whose rank we are changing.
   * @param {number} rank The rank to set.
   */
  insertUserRank(username, rank) {
    const statement =
        this.db.prepare('UPDATE users SET rank = ? WHERE uname = ?', [rank, username]);
    statement.run();
  }

  /**
   * Update a user's points.
   *
   * @param {string} username The user whose points we are changing.
   * @param {number} delta Change in the user's points to apply, i.e. 5 or -10.
   * @return {!Promise<void>} Promise indicating the change's completion.
   */
  async updateUserPoints(username, delta) {
    const currentPoints = await this.getUserPoints(username);
    const newPoints = (currentPoints + delta) >= 0 ? (currentPoints + delta) : 0;
    const statement = this.db.prepare(
        'UPDATE users SET points = ? WHERE LOWER(uname) = ?', [newPoints, username.toLowerCase()]);
    return dbRunStatement(statement);
  }

  /**
   * Inserts the usercount from a usercount frame.
   *
   * @param {number} count The number of users at timestamp.
   * @param {string} timestamp The time the frame was sent.
   */
  insertUsercount(count, timestamp) {
    const statement = this.db.prepare('INSERT INTO user_count VALUES(?, ?)', [timestamp, count]);
    statement.run();
  }

  /**
   * Set the end time for a user's tempban.
   *
   * @param {string} user The user to tempban.
   * @param {number} timestamp The Unix timestamp (seconds) when the user's tempban ends.
   * @return {!Promise<void>} Empty promise indicating the operation's completion.
   */
  setUserTempBan(user, timestamp) {
    const statement = this.db.prepare(
        'UPDATE users SET suspended_until_unix = ? WHERE uname = ?', [timestamp, user]);
    return dbRunStatement(statement);
  }

  /**
   * Set the end time for a user's timeout.
   *
   * @param {string} user The user to time out.
   * @param {number} timestamp The Unix timestamp (seconds) when the user's timeout ends.
   * @return {!Promise<void>} Empty promise indicating the operation's completion.
   */
  setUserTimeout(user, timestamp) {
    const statement = this.db.prepare(
        'UPDATE users SET timed_out_until_unix = ? WHERE uname = ?', [timestamp, user]);
    return dbRunStatement(statement);
  }

  /**
   * Enable or disable a module.
   *
   * @param {string} module Module to enable/disable.
   * @param {boolean} enabled Whether the module should be enabled or disabled.
   * @return {!Promise<void>} Promise indicating the operation's success.
   */
  async setModuleEnabled(module, enabled) {
    infoLog.log(`Setting module ${module} to enabled=${enabled}`);
    const insert = this.db.prepare(
        'INSERT OR IGNORE INTO modules(name, enabled) VALUES (?, ?)',
        [module.toLowerCase(), enabled.toString()]);
    await dbRunStatement(insert);
    const update = this.db.prepare(
        'UPDATE modules SET enabled = ? WHERE name = ?',
        [enabled.toString(), module.toLowerCase()]);
    return dbRunStatement(update);
  }

  /**
   * Gets all the users with a blacklist.
   *
   * @return {!Promise<!Array<string>>} Usernames of users with a blacklist.
   */
  getAllBlacklistedUsers() {
    const statement = this.db.prepare(`SELECT uname FROM users WHERE blacklisted IN ('true', '1')`);

    return new Promise((resolve, reject) => {
      statement.all((err, rows) => {
        if (err) {
          reject(err);
        }
        if (!rows) {
          resolve([]);
        }
        resolve(rows.map((item) => item.uname));
      });
    });
  }

  /**
   * Gets all the blocked users.
   *
   * @return {!Promise<!Array<string>>} Usernames of blocked users.
   */
  getAllBlockedUsers() {
    const statement = this.db.prepare(`SELECT uname FROM users WHERE block IN ('true', '1')`);

    return new Promise((resolve, reject) => {
      statement.all((err, rows) => {
        if (err) {
          reject(err);
        }
        if (!rows) {
          resolve([]);
        }
        resolve(rows.map((item) => item.uname));
      });
    });
  }

  /**
   * Gets the usercounts for the average users chart.
   *
   * Basically ported from naoko.
   *
   * @param {!Function} callback The callback function.
   */
  getAverageUsers(callback) {
    const sql = `
        SELECT STRFTIME('%s',
                    STRFTIME('%Y-%m-%dT%H:00', timestamp / 1000, 'UNIXEPOCH')
                  ) * 1000 AS timestamp,
                CAST(ROUND(AVG(count)) AS INTEGER) AS count
        FROM user_count

        GROUP BY STRFTIME('%Y%m%d%H', timestamp / 1000, 'UNIXEPOCH')
      `;

    const statement = this.db.prepare(sql);
    const returnData = [];

    statement.all((err, rows) => {
      if (err) {
        return;
      }

      // Format data for google charts.
      for (let i = 0; i < rows.length; i++) {
        returnData.push([rows[i].timestamp, rows[i].count]);
      }
      callback(null, returnData);
    });
  }

  /**
   * Gets the amount of messages by each user.
   *
   * Used for the chat stats chart.
   *
   * @param {!Function} callback The callback function.
   */
  getChatStats(callback) {
    const sql = `
        SELECT username, COUNT(*) as count
        FROM chat
        GROUP BY username
        ORDER BY COUNT(*) DESC
      `;
    const statement = this.db.prepare(sql);
    const returnData = [];

    statement.all((err, rows) => {
      if (err) {
        return;
      }

      // Format data for google charts.
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].username !== '') {
          returnData.push([rows[i].username, rows[i].count]);
        }
      }
      callback(null, returnData);
    });
  }

  /**
   * Get emote count - number of times an emote has been used.
   *
   * @param {string} emote Emote to get the count for.
   * @param {string=} user Name of the user to get the count for. Optional. If not provided, will
   *     get the emote count for all users combined.
   * @return {!Promise<number>} The number of chats the user has sent.
   */
  getEmoteCount(emote, user) {
    const query = `
        SELECT SUM(msgEmoteCount) as emoteCount

        FROM (
          SELECT LENGTH(msg) - LENGTH(REPLACE(msg, ?, ?)) AS msgEmoteCount

          FROM chat

          WHERE msg LIKE ?
            ${user ? 'AND username = ?' : ''}
        )
      `;
    console.log(query);

    const params = [emote, emote.substring(0, emote.length - 1), `%${emote}%`];
    if (user) {
      params.push(user);
    }

    const statement = this.db.prepare(query, params);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (err) {
          reject(err);
        }
        if (row) {
          resolve(row.emoteCount || 0);
        } else {
          resolve(0);
        }
      });
    });
  }

  /**
   * Bot stats.
   *
   * @typedef {Object} BotStats
   * @property {string} userCount Count of users that joined.
   * @property {string} videoCount Count of videos queued.
   * @property {string} chatCount Count of chats sent.
   */

  /**
   * Gets the counts of videos, users, and chats.
   *
   * @return {!Promise<!BotStats>} The bot stats.
   */
  getGeneralStats() {
    const query = `
        SELECT stat
        FROM sqlite_stat1
        WHERE tbl = 'users'
          OR tbl = 'videos'
          OR tbl = 'chat'
      `;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('ANALYZE');
        this.db.all(query, (err, rows) => {
          if (err) {
            reject(err);
          }
          if (rows) {
            resolve({
              userCount: rows[2].stat.split(' ')[0],
              videoCount: rows[0].stat.split(' ')[0],
              chatCount: rows[1].stat.split(' ')[0],
            });
          } else {
            resolve(null);
          }
        });
      });
    });
  }

  /**
   * Get chat stats for a given user.
   *
   * @param {string} user The user to retrieve chat stats for.
   * @return {!Promise<number>} The number of chats the user has sent.
   */
  getUserStats(user) {
    const query = `
        SELECT COUNT(*) as chats
        FROM chat
        WHERE username = ?
      `;

    const statement = this.db.prepare(query, [user]);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (err) {
          reject(err);
        }
        if (row) {
          resolve(row.chats);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Determine if a given module is enabled.
   *
   * @param {string} module Name of the module to check.
   * @return {!Promise<boolean>} Whether the module is enabled.
   */
  async moduleIsEnabled(module) {
    const statement = this.db.prepare(
        'SELECT enabled FROM modules WHERE LOWER(name) = ?', [module.toLowerCase()]);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (err) {
          reject(err);
        }
        if (typeof row === 'undefined') {
          errorLog.log(`Module ${module} does not exist`);
          resolve(false);
          return;
        }
        resolve(row.enabled === 'true');
      });
    });
  }

  /**
   * Get all modules present in the database.
   *
   * @return {!Promise<Array<string>>} All modules present in the database.
   */
  async getAllModules() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT name FROM modules', (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows.map((row) => row.name));
      });
    });
  }

  /**
   * Gets a page of leaderboard data.
   *
   * @param {number} pageNumber Gets a given leaderboard page.
   * @param {number} pageSize Number of items to return in the page.
   * @return {!Promise<!Array<!LeaderboardUser>>} The leaderboard data.
   */
  async getLeaderboardPage(pageNumber, pageSize) {
    const query = `
          SELECT uname AS name,
                  points
          FROM users
          ORDER BY points DESC
          LIMIT ?
          OFFSET ?
        `;
    const statement = this.db.prepare(query, [
      pageSize,
      pageNumber * pageSize,
    ]);

    return new Promise((resolve, reject) => {
      statement.all((err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      });
    });
  }

  /**
   * Gets the 10 most popular videos.
   *
   * Used for the popular videos chart.
   *
   * @param {!Function} callback The callback function.
   */
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

    const statement = this.db.prepare(sql);

    const returnData = [];

    statement.all((err, rows) => {
      if (err) {
        return;
      }

      // Format data for google charts.
      for (let i = 0; i < rows.length; i++) {
        returnData.push([
          rows[i].type,
          rows[i].id,
          rows[i].title,
          rows[i].flags,
          rows[i].count,
        ]);
      }
      callback(null, returnData);
    });
  }

  /**
   * A quote from a user.
   *
   * @typedef {Object} Quote
   * @property {string} username Name of the user that made the quote.
   * @property {string} msg The quote itself.
   * @property {string} timestamp Timestamp of when the message was sent.
   */

  /**
   * Gets a chat message.
   *
   * If user is given, it will select a quote from that user.
   * If no user is given, it will select a random quote.
   *
   * @param {string?} user The username we are getting a quote for.
   * @return {!Promise<?Quote>} A quote for the user, or null.
   */
  getQuote(user) {
    if (user) {
      const query = `
          SELECT username, msg, timestamp
          FROM chat
          WHERE username = ?
          COLLATE NOCASE
          ORDER BY RANDOM()
          LIMIT 1
        `;
      const statement = this.db.prepare(query, [user]);

      return new Promise((resolve, reject) => {
        statement.get((err, row) => {
          if (err) {
            reject(err);
          }

          if (row) {
            resolve(row);
          } else {
            resolve(null);
          }
        });
      });
    }

    const query = `
        SELECT username,
                msg,
                timestamp
        FROM chat
        WHERE msg NOT LIKE '/me%'
          AND msg NOT LIKE '$%'
        ORDER BY RANDOM()
        LIMIT 1
      `;
    return new Promise((resolve, reject) => {
      this.db.get(query, (err, row) => {
        if (err) {
          reject(err);
        }

        if (row) {
          resolve(row);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Fetches all of the stats required by the stats page.
   *
   * Functions are chained together with the last function giving the callback
   * the final returnData object.
   *
   * @param {string} room The room the bot is currently in.
   * @return {!Promise<?>} The stats.
   */
  async getStats(room) {
    return parallel({
             userVideoStats: this.getVideoStats.bind(this),
             userChatStats: this.getChatStats.bind(this),
             popularVideos: this.getPopularVideos.bind(this),
             averageUsers: this.getAverageUsers.bind(this),
           })
        .then((results) => {
          results.room = room;
          return results;
        });
  }

  /**
   * Get a list of all users that have been seen in the room.
   *
   * @return {!Promise<Array<string>>} The usernames of the users.
   */
  getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT uname FROM users', (err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows.map((row) => row.uname));
      });
    });
  }

  /**
   * Get all currently tempbanned users.
   *
   * @return {!Promise<!Array<!TempBannedUser>>} All currently tempbanned users.
   */
  getAllTempBans() {
    const query = `
        SELECT uname, suspended_until_unix
        FROM users
        WHERE suspended_until_unix > ?
      `;

    const statement = this.db.prepare(query, [getCurrentUnixTimestamp()]);

    return new Promise((resolve, reject) => {
      statement.all((err, rows) => {
        if (err) {
          reject(err);
        }

        try {
          const /** @type {!Array<!TempBannedUser>} */ users = [];
          for (const row of rows) {
            users.push({name: row.uname, end: row.suspended_until_unix});
          }
          resolve(users);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Get all currently timed out users.
   *
   * @return {!Promise<!Array<!TimedOutUser>>} All currently timed out users.
   */
  getAllTimeouts() {
    const query = `
        SELECT uname, timed_out_until_unix
        FROM users
        WHERE timed_out_until_unix > ?
      `;

    const statement = this.db.prepare(query, [getCurrentUnixTimestamp()]);

    return new Promise((resolve, reject) => {
      statement.all((err, rows) => {
        if (err) {
          reject(err);
        }

        try {
          const /** @type {!Array<!TimedOutUser>} */ users = [];
          for (const row of rows) {
            users.push({name: row.uname, end: row.timed_out_until_unix});
          }
          resolve(users);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * Checks whether a user is blacklisted.
   *
   * @param {string} username The user we are checking.
   * @return {!Promise<boolean>} Whether the user is blacklisted.
   */
  getUserBlacklist(username) {
    const statement = this.db.prepare('SELECT blacklisted FROM users WHERE uname = ?', [username]);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (typeof row !== 'undefined') {
          resolve(row.blacklisted === 'true' || row.blacklisted === '1');
        }
        reject(err);
      });
    });
  }

  /**
   * Selects the block column for user.
   *
   * @param {string} username The user we are looking up.
   * @return {!Promise<boolean>} Whether the user is blocked.
   */
  getUserBlock(username) {
    const statement = this.db.prepare('SELECT block FROM users WHERE uname = ?', [username]);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (typeof row !== 'undefined') {
          resolve(
              row.block === 'true' || row.block === '1' || row.blacklisted === 'true' ||
              row.blacklisted === '1');
        }
        reject(err);
      });
    });
  }

  /**
   * Get the end time for a user's tempban.
   *
   * @param {string} user The user to time out.
   * @return {!Promise<number>} The Unix timestamp (seconds) when the user's tempban ends.
   */
  getUserTempBanEnd(user) {
    const statement =
        this.db.prepare('SELECT suspended_until_unix FROM users WHERE uname = ?', [user]);
    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (typeof row !== 'undefined') {
          resolve(parseInt(row.suspended_until_unix, 10));
        }
        reject(err);
      });
    });
  }

  /**
   * Get the end time for a user's timeout.
   *
   * @param {string} user The user to time out.
   * @return {!Promise<number>} The Unix timestamp (seconds) when the user's timeout ends.
   */
  getUserTimeoutEnd(user) {
    const statement =
        this.db.prepare('SELECT timed_out_until_unix FROM users WHERE uname = ?', [user]);
    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (typeof row !== 'undefined') {
          resolve(parseInt(row.timed_out_until_unix, 10));
        }
        reject(err);
      });
    });
  }

  /**
   * Gets a user's rank.
   *
   * @param {string} username User to look up.
   * @return {!Promise<number>} The user's rank.
   */
  getUserRank(username) {
    const statement = this.db.prepare('SELECT rank FROM users WHERE uname = ?', [username]);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (typeof row !== 'undefined') {
          resolve(row.rank);
        }
        reject(err);
      });
    });
  }

  /**
   * Gets a user's points.
   *
   * @param {string} username User to look up.
   * @return {!Promise<number>} The user's points.
   */
  getUserPoints(username) {
    const statement = this.db.prepare(
        'SELECT points FROM users WHERE LOWER(uname) = ?', [username.toLowerCase()]);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (err) {
          reject(err);
        }
        if (typeof row === 'undefined') {
          resolve(0);
        }
        resolve(row.points);
      });
    });
  }

  /**
   * Gets the database version.
   *
   * @return {!Promise<string?>} The current database version.
   */
  getVersion() {
    const statement = this.db.prepare(`SELECT value FROM version WHERE key = 'dbversion'`);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (err) {
          reject(err);
        }
        resolve((row === undefined || row.value === undefined) ? null : row.value);
      });
    });
  }

  /**
   * Fetches num random videos, if num is zero it fetches 1 video.
   *
   * Limits videos to those under 10 minutes and whose type is yt, dm, or vm.
   *
   * Used by the addRandom() method.
   *
   * @param {number} num The number of videos we are getting.
   * @return {!Promise<!Array<?>>} Database rows for the videos.
   */
  getVideos(num) {
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

    const statement = this.db.prepare(sql, [this.maxVideoLength, num]);

    return new Promise((resolve, reject) => {
      statement.all((err, rows) => {
        if (err) {
          reject(err);
        }
        resolve(rows);
      });
    });
  }

  getVideosCountForClean() {
    const sql = `
        SELECT count(*) AS count
        FROM videos
        WHERE flags = 0
          AND type = 'yt'
          AND duration_ms < ?
      `;
    return new Promise((resolve, reject) => {
      this.db.get(sql, [this.maxVideoLength], (err, row) => {
        if (err) {
          errorLog.log(err);
          reject(err);
        }
        resolve(row.count);
      });
    });
  }

  /**
   * Gets the number of videos in the database.
   *
   * @param {!Function} callback The callback function.
   */
  getVideosCount(callback) {
    this.db.get('SELECT count(*) AS count FROM videos', (err, row) => {
      if (err) {
        return errorLog.log(err);
      }

      callback(row.count);
    });
  }

  /**
   * Gets the number of videos added by each user.
   *
   *  Used by the video by user chart.
   *
   * @param {!Function} callback The callback function.
   */
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

    const statement = this.db.prepare(sql);
    const returnData = [];

    statement.all((err, rows) => {
      if (err) {
        return;
      }

      // Format data for google charts.
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].uname !== '') {
          returnData.push([rows[i].uname, rows[i].count]);
        }
      }

      callback(null, returnData);
    });
  }

  /**
   * Gets the flag of a video.
   *
   * @param {string} type The type of the video we are looking up.
   * @param {string} id The ID of the video we are looking up.
   * @return {!Promise<number>} Flags for the video.
   */
  getVideoFlag(type, id) {
    const statement =
        this.db.prepare('SELECT flags FROM videos WHERE type = ? AND id = ?', [type, id]);

    return new Promise((resolve, reject) => {
      statement.get((err, row) => {
        if (row && row.flags) {
          resolve(row.flags);
        }
        resolve(0);
      });
    });
  }
}
