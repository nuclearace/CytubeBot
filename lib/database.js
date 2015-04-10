var sqlite3 = require("sqlite3")
var logger = require("./logger")
var async = require("async")

module.exports = {
	init: function(logger, maxVideoLength) {
        var db = new Database(logger, maxVideoLength)
        return db
    }
}

function Database(logger, maxVideoLength) {
    this.db = new sqlite3.Database("./cytubebot.db")
    this.logger = logger
    this.maxVideoLength = maxVideoLength
    this.createTables()
}

// Creates the tables if they do not exist
Database.prototype.createTables = function() {
    this.db.serialize()
    this.db.run("CREATE TABLE IF NOT EXISTS users(uname TEXT, blacklisted TEXT, block TEXT, primary key(uname))")
    this.db.run("CREATE TABLE IF NOT EXISTS chat(timestamp INTEGER, username TEXT, msg TEXT, channel TEXT)")
    this.db.run("CREATE TABLE IF NOT EXISTS " +
        "videos(type TEXT, id TEXT, duration_ms INTEGER, title TEXT, flags INTEGER, primary key(type, id))")
    this.db.run("CREATE TABLE IF NOT EXISTS video_stats(type TEXT, id TEXT, uname TEXT)")
    this.db.run("CREATE TABLE IF NOT EXISTS user_count(timestamp INTEGER, count INTEGER, primary key(timestamp, count))")
    this.db.run("CREATE TABLE IF NOT EXISTS version(key TEXT, value TEXT, PRIMARY KEY(key))")

    this.updateTables()
};

// Updates the tables as needed
Database.prototype.updateTables = function() {
    var self = this
    this.getVersion(function(version) {
        if (!version) {
            var update = self.db.prepare("INSERT INTO version(key, value) VALUES (?, ?)", ['dbversion', '1'])
            update.run(function() {
                self.db.run("ALTER TABLE users ADD rank INTEGER")
                self.db.parallelize()
            })
        }
    })
};

// Sets a flag on a video
// type - The video type eg. "yt"
// id - The ID of the video
// flags - The flag, should be 1
// title - Title of the video
Database.prototype.flagVideo = function(type, id, flags, title) {
    this.logger.syslog.log("*** Flagging video: " + title + " with flag: " + flags)

    var stmt = this.db.prepare("UPDATE videos SET flags = ? WHERE type = ? AND id = ?", [flags, type, id])
    stmt.run()

    stmt.finalize()
};

// WARNING - This is experimental
// Deletes videos from the database that are like like
// We serialize the database to stop the final getVideosCount from executing
// before the other queries have run
// like - What to match. Example: %skrillex% will delete all videos
// with the word "skrillex" in it
// callback - The callback function, sends a chatMsg with how many videos
// we deleted
Database.prototype.deleteVideos = function(like, callback) {
    var db = this
    this.logger.syslog.log("*** Deleting videos where title like " + like)
    var before = 0
    var after = 0
    var videoIds = {}

    var getAfter = function() {
        db.getVideosCount(function(num) {
            after = num
            callback(before - after)
        })
    }

    var deleteVideos = function() {
        for (var i = 0; i < videoIds.length; i++) {
            var stmt1 = db.db.prepare("DELETE FROM videos WHERE id = ? " +
                "AND type = ?", [videoIds[i]["id"], videoIds[i]["type"]])
            var stmt2 = db.db.prepare("DELETE FROM video_stats WHERE id = ? AND type = ?", [videoIds[i]["id"], videoIds[i]["type"]])

            stmt1.run()
            stmt2.run()
        }
        getAfter()
    }

    var getVideoIds = function() {
        db.db.all("SELECT id, type FROM videos WHERE title LIKE ? AND flags = 0", (like), function(err, rows) {
            if (err)
                return
            videoIds = rows
            deleteVideos()
        })
    }

    var start = function() {
        db.getVideosCount(function(num) {
            before = num
            getVideoIds()
        })
    }

    // Lets get on the ride
    this.db.serialize(start)
};

// Inserts a chatMsg into the chat table
// msg - The message that we are inserting
// time - The timestamp of the message
// nick - The user who said it
// room - The room in which it was said
Database.prototype.insertChat = function(msg, time, nick, room) {
    var stmt = this.db.prepare("INSERT INTO chat VALUES(?, ?, ?, ?)", [time, nick, msg, room])
    stmt.run()

    stmt.finalize()
};

// Inserts a video into the database
// site - The type of video eg. "yt"
// vid - The ID of the video
// title - The title of the video
// dur - The duration of the video
// nick - The user who added the video
Database.prototype.insertVideo = function(site, vid, title, dur, nick) {
    this.logger.syslog.log("*** Inserting: " + title + " into the database")

    var stmt1 = this.db.prepare("INSERT OR IGNORE INTO videos VALUES(?, ?, ?, ?, ?)", [site, vid, dur * 1000, title, 0])
    var stmt2 = this.db.prepare("INSERT INTO video_stats VALUES(?, ?, ?)", [site, vid, nick])

    stmt1.run()
    stmt1.finalize()

    stmt2.run()
    stmt2.finalize()
};

// Inserts a user into the user table
// username - The user we are adding
// rank - The users rank
Database.prototype.insertUser = function(username, rank) {
    if (!username)
        return

    var stmt = this.db.prepare("INSERT OR IGNORE INTO users VALUES (?, 'false', 'false', ?)", [username, rank])
    stmt.run()

    stmt.finalize()
};

// Sets the blacklisted flag on the user table
// username - The user we are setting the flag on
// flag - The flag to set
// callback - The callback function
Database.prototype.insertUserBlacklist = function(username, flag, callback) {
    this.logger.syslog.log("Setting blacklist: " + flag + " on user: " + username)

    var stmt = this.db.prepare("UPDATE users SET blacklisted = ? WHERE uname = ?", [flag, username])
    stmt.run(callback)
};

// Sets the block column of user
// user - The user
// flag - The value
Database.prototype.insertUserBlock = function(username, flag, callback) {
    this.logger.syslog.log("*** Setting block: " + flag + " on user: " + username)
    var stmt = this.db.prepare("UPDATE users SET block = ? WHERE uname = ?", [flag, username])

    stmt.run(callback)
};

// Handles changes to a user's rank
// user - The user whose rank we are changing
// rank - The rank to set
Database.prototype.insertUserRank = function(username, rank) {
    var stmt = this.db.prepare("UPDATE users SET rank = ? WHERE uname = ?", [rank, username])
    stmt.run()
};

// Inserts the usercount, from a usercount frame
// count - The number of users at timestamp
// timestamp - The time the frame was sent
Database.prototype.insertUsercount = function(count, timestamp) {
    var stmt = this.db.prepare("INSERT INTO user_count VALUES(?, ?)", [timestamp, count])
    stmt.run()
};

// Gets all the users with a blacklist
// callback - The callback function
Database.prototype.getAllBlacklistedUsers = function(callback) {
    var stmt = this.db.prepare("SELECT uname FROM users WHERE blacklisted = '1'")
    var users = []

    stmt.all(function(err, rows) {
        if (rows) {
            for (var i = 0; i < rows.length; i++) {
                users.push(rows[i]["uname"])
            }
            callback(users)
        }
    })
};

// Gets all the blocked users
Database.prototype.getAllBlockedUsers = function(callback) {
    var stmt = this.db.prepare("SELECT uname FROM users WHERE block = '1'")
    var users = []

    stmt.all(function(err, rows) {
        if (rows) {
            for (var i = 0; i < rows.length; i++) {
                users.push(rows[i]["uname"])
            }
            callback(users)
        }
    })
};

// Gets the usercounts for the average users chart
// Basically ported from naoko
// callback - The callback function
Database.prototype.getAverageUsers = function(callback) {
    var select_cls = "SELECT STRFTIME('%s', STRFTIME('%Y-%m-%dT%H:00', timestamp/1000, 'UNIXEPOCH'))*1000 AS timestamp," +
        " CAST(ROUND(AVG(count)) AS INTEGER) AS count FROM user_count "
    var group_cls = " GROUP BY STRFTIME('%Y%m%d%H', timestamp/1000, 'UNIXEPOCH')"
    var sql = select_cls + group_cls

    var stmt = this.db.prepare(sql)
    var returnData = []

    stmt.all(function(err, rows) {
        if (err)
            return

        // Format data for google charts
        for (var i = 0; i < rows.length; i++) {
            returnData.push([rows[i]["timestamp"], rows[i]["count"]])
        }
        callback(null, returnData)
    })
};

// Gets the amount of messages by each user
// Used for the chat stats chart
// callback - The callback function
Database.prototype.getChatStats = function(callback) {
    var select_cls = "SELECT username, count(*) as count FROM chat "
    var group_cls = " GROUP BY username ORDER BY count(*) DESC"
    var sql = select_cls + group_cls
    var stmt = this.db.prepare(sql)
    var returnData = []

    stmt.all(function(err, rows) {
        if (err)
            return

        // Format data for google charts
        for (var i = 0; i < rows.length; i++) {
            if (rows[i]["username"] !== "")
                returnData.push([rows[i]["username"], rows[i]["count"]])
        }
        callback(null, returnData)
    })
};

// Does ANALYZE on the database
// Used to get the counts of videos, users, and chat
// callback - The callback function
Database.prototype.getGeneralStats = function(callback) {
    var self = this
    var stmt = "ANALYZE"
    var stmt2 = "SELECT stat FROM sqlite_stat1 WHERE tbl = 'users' OR tbl = 'videos' OR tbl = 'chat'"

    this.db.serialize(function() {
        self.db.run(stmt)
        self.db.all(stmt2, function(err, rows) {
            if (rows)
                callback(rows)
        })
    })
};

// Gets the 10 most popular videos
// Used for the popular videos chart
// callback - The callback function
Database.prototype.getPopularVideos = function(callback) {
    var select_cls = "SELECT videos.type, videos.id, videos.title, videos.flags & 1, count(*) AS count FROM videos, video_stats"
    var where_cls = " WHERE video_stats.type = videos.type AND video_stats.id = videos.id AND NOT videos.flags & 2 "
    var group_cls = " GROUP BY videos.type, videos.id ORDER BY count(*) DESC LIMIT 10"
    var sql = select_cls + where_cls + group_cls

    var stmt = this.db.prepare(sql)

    var returnData = []

    stmt.all(function(err, rows) {
        if (err)
            return

        // Format data for google charts
        for (var i = 0; i < rows.length; i++) {
            returnData.push([rows[i]["type"], rows[i]["id"], rows[i]["title"],
                rows[i]["flags"], rows[i]["count"]
            ])
        }
        callback(null, returnData)
    })
};

// Gets a chat message
// If nick is given, it will select a quote from that user
// If no nick is given, it will select a random quote
// nick - The username we are getting a quote for
// callback - The callback function
Database.prototype.getQuote = function(nick, callback) {
    nick = nick.split(" ")[0]
    var stmt = {}

    if (nick) {
        stmt = this.db.prepare("SELECT username, msg, timestamp FROM chat WHERE " +
            "username = ? COLLATE NOCASE ORDER BY RANDOM() LIMIT 1", [nick])

        stmt.get(function(err, row) {
            if (row)
                return callback(row)
        })
        return callback(0)
    }

    stmt = "SELECT username, msg, timestamp FROM chat WHERE msg NOT LIKE '/me%' " +
        "AND msg NOT LIKE '$%' ORDER BY RANDOM() LIMIT 1"
    this.db.get(stmt, function(err, row) {
        if (row)
            callback(row)
    })

};

// Fetches all of the stats required by the stats page
// Functions are chained together with the last function
// giving the callback the final returnData object
// room - The room the bot is currently in
// callback - The callback function
Database.prototype.getStats = function(room, callback) {
    var self = this

    // Lets go on another ride
    async.parallel({
        userVideoStats: self.getVideoStats.bind(self),
        userChatStats: self.getChatStats.bind(self),
        popularVideos: self.getPopularVideos.bind(self),
        averageUsers: self.getAverageUsers.bind(self)
    }, function(err, results) {
        if (err)
            return

        results["room"] = room
        callback(results)
    })
};

// Checks whether a user is blacklisted
// username - The user we are checking
// callback - The callback function
Database.prototype.getUserBlacklist = function(username, callback) {
    var stmt = this.db.prepare("SELECT blacklisted FROM users WHERE uname = ?", [username])

    stmt.get(function(err, row) {
        if (typeof row !== "undefined") {
            callback(row["blacklisted"])
        }
    })
};

// Selects the autodelete column for user
// username - The user we are looking up
// callback - Callback function
Database.prototype.getUserBlock = function(username, callback) {
    var stmt = this.db.prepare("SELECT block FROM users WHERE uname = ?", [username])

    stmt.get(function(err, row) {
        if (typeof row !== "undefined") {
            callback(row["block"])
        }
    })
};

// Gets a user's rank
// Callback - callback function
Database.prototype.getUserRank = function(username, callback) {
    var stmt = this.db.prepare("SELECT rank FROM users WHERE uname = ?", [username])

    stmt.get(function(err, row) {
        if (typeof row !== "undefined")
            callback(row["rank"])
    })
};

// Gets the database version
Database.prototype.getVersion = function(callback) {
    var stmt = this.db.prepare("SELECT value FROM version WHERE key = 'dbversion'")

    stmt.get(function(err, row) {
        if (row === undefined)
            callback(null)
        else
            callback(row)
    })
};

// Used by the addRandom() method
// Fetches num random videos, if num is zero it fetches 1 video
// Limits videos to those under 10 minutes and whose type is yt, dm, or vm
// num - The number of videos we are getting
// callback - The callback function
Database.prototype.getVideos = function(num, callback) {
    if (!num)
        num = 1

    var stmt = this.db.prepare("SELECT type, id, duration_ms FROM videos " +
        "WHERE flags = 0 AND duration_ms < ? AND (type = 'yt' OR type = 'dm' OR type = 'vm') " +
        "ORDER BY RANDOM() LIMIT ?", [this.maxVideoLength, num])

    stmt.all(function(err, rows) {
        callback(rows)
    })
};

// Gets the number of videos in the database
// callback - The callback function
Database.prototype.getVideosCount = function(callback) {
    var self = this

    this.db.get("SELECT count(*) AS count FROM videos", function(err, row) {
        if (err)
            return self.logger.errlog.log(err)

        callback(row["count"])
    })
};

// Gets the number of videos added by each user
// Used by the video by user chart
// callback - The callback function
Database.prototype.getVideoStats = function(callback) {
    var select_cls = "SELECT uname, count(*) AS count FROM video_stats vs, videos v "
    var where_cls = " WHERE vs.type = v.type AND vs.id = v.id AND NOT v.flags & 2 "
    var group_cls = " GROUP BY uname ORDER BY count(*) DESC"
    var sql = select_cls + where_cls + group_cls
    var stmt = this.db.prepare(sql)
    var returnData = []

    stmt.all(function(err, rows) {
        if (err)
            return

        // Format data for google charts
        for (var i = 0; i < rows.length; i++) {
            if (rows[i]["uname"] !== "")
                returnData.push([rows[i]["uname"], rows[i]["count"]])
        }

        callback(null, returnData)
    })
};

// Gets the flag of a video
// type - The type of the video we are looking up
// id - The ID of the video we are looking up
// callback - The callback function
Database.prototype.getVideoFlag = function(type, id, callback) {
    var stmt = this.db.prepare("SELECT flags FROM videos videos WHERE type = ? AND id = ?", [type, id])

    stmt.get(function(err, row) {
        if (row)
            callback(row)
        else
            callback(0)
    })
};
