var sqlite3 = require('sqlite3')

module.exports = {
	init: function() {
		var db = new Database()
		return db
	}
}

	function Database() {
		this.db = new sqlite3.Database("./cytubebot.db")
		this.createTables()
	}

Database.prototype.createTables = function() {
	this.db.run("CREATE TABLE IF NOT EXISTS users(uname TEXT, blacklisted TEXT, block TEXT, primary key(uname))")
	this.db.run("CREATE TABLE IF NOT EXISTS chat(timestamp INTEGER, username TEXT, msg TEXT, channel TEXT)")
	this.db.run("CREATE TABLE IF NOT EXISTS " +
		"videos(type TEXT, id TEXT, duration_ms INTEGER, title TEXT, flags INTEGER, primary key(type, id))")
	this.db.run("CREATE TABLE IF NOT EXISTS video_stats(type TEXT, id TEXT, uname TEXT)")
	this.db.run("CREATE TABLE IF NOT EXISTS user_count(timestamp INTEGER, count INTEGER, primary key(timestamp, count))")
};

Database.prototype.blacklistVideo = function(type, id, flags, title) {
	console.log("*** Blacklisting video: " + title)

	stmt = this.db.prepare("UPDATE videos SET flags=(flags | ?) WHERE type = ? AND id = ?", [flags, type, id])
	stmt.run()

	stmt.finalize()
};

Database.prototype.blockVideo = function(type, id, flags, title) {
	console.log("*** Setting block on video " + title)

	stmt = this.db.prepare("UPDATE videos SET flags=(flags | ?) WHERE type = ? AND id = ?", [flags, type, id])
	stmt.run()

	stmt.finalize()
};

Database.prototype.deleteVideos = function(like, callback) {
	var db = this
	console.log("!~~~! Deleting videos where title like " + like)
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
	this.db.serialize(start())
};

Database.prototype.insertChat = function(msg, time, nick, room) {
	var stmt = this.db.prepare("INSERT INTO chat VALUES(?, ?, ?, ?)", [time, nick, msg, room])
	stmt.run()

	stmt.finalize()
};

Database.prototype.insertVideo = function(site, vid, title, dur, nick) {
	console.log("*** Inserting: " + title + " into the database")

	var stmt1 = this.db.prepare("INSERT OR IGNORE INTO videos VALUES(?, ?, ?, ?, ?)", [site, vid, dur * 1000, title, 0])
	var stmt2 = this.db.prepare("INSERT INTO video_stats VALUES(?, ?, ?)", [site, vid, nick])

	stmt1.run()
	stmt1.finalize()

	stmt2.run()
	stmt2.finalize()
};

Database.prototype.insertUser = function(username) {
	var stmt = this.db.prepare("INSERT OR IGNORE INTO users VALUES (?, 'false', 'false')", [username])
	stmt.run()

	stmt.finalize()
};

Database.prototype.insertUsercount = function(count, timestamp) {
	var stmt = this.db.prepare("INSERT INTO user_count VALUES(?, ?)", [timestamp, count])
	stmt.run()
};

Database.prototype.getAverageUsers = function(callback) {
	var select_cls = "SELECT STRFTIME('%s', STRFTIME('%Y-%m-%dT%H:00', timestamp/1000, 'UNIXEPOCH'))*1000 AS timestamp," +
		" CAST(ROUND(AVG(count)) AS INTEGER) AS count FROM user_count "
	var group_cls = " GROUP BY STRFTIME('%Y%m%d%H', timestamp/1000, 'UNIXEPOCH')"
	var sql = select_cls + group_cls

	var stmt = this.db.prepare(sql)
	var returnData = new Array()

	stmt.all(function(err, rows) {
		if (err)
			return

		// Format data for google charts
		for (var i = 0; i < rows.length; i++) {
			console.log(rows)
			returnData.push([rows[i]["timestamp"], rows[i]["count"]])
		}
		callback(returnData)
	})
};

Database.prototype.getChatStats = function(callback) {
	var select_cls = "SELECT username, count(*) as count FROM chat "
	var group_cls = " GROUP BY username ORDER BY count(*) DESC"
	var sql = select_cls + group_cls
	var stmt = this.db.prepare(sql)
	var returnData = new Array()

	stmt.all(function(err, rows) {
		if (err)
			return

		// Format data for google charts
		for (var i = 0; i < rows.length; i++) {
			if (rows[i]["username"] !== "")
				returnData.push([rows[i]["username"], rows[i]["count"]])
		}
		callback(returnData)
	})
};

Database.prototype.getPopularVideos = function(callback) {
	var select_cls = "SELECT videos.type, videos.id, videos.title, videos.flags & 1, count(*) AS count FROM videos, video_stats"
	var where_cls = " WHERE video_stats.type = videos.type AND video_stats.id = videos.id AND NOT videos.flags & 2 "
	var group_cls = " GROUP BY videos.type, videos.id ORDER BY count(*) DESC LIMIT 10"
	var sql = select_cls + where_cls + group_cls

	var stmt = this.db.prepare(sql)

	var returnData = new Array()

	stmt.all(function(err, rows) {
		if (err)
			return

		// Format data for google charts
		for (var i = 0; i < rows.length; i++) {
			returnData.push([rows[i]["type"], rows[i]["id"], rows[i]["title"],
				rows[i]["flags"], rows[i]["count"]
			])
		}

		callback(returnData)
	})
};

Database.prototype.getQuote = function(nick, callback) {
	var nick = nick.split(" ")[0]
	if (nick) {
		var stmt = this.db.prepare("SELECT username, msg, timestamp FROM chat WHERE " +
			"username = ? COLLATE NOCASE ORDER BY RANDOM() LIMIT 1", [nick])
		stmt.get(function(err, row) {
			if (row) {
				callback(row)
				return
			}
		})
		callback(0)
		return
	}

	var stmt = "SELECT username, msg, timestamp FROM chat WHERE msg NOT LIKE '/me%' " +
		"AND msg NOT LIKE '$%' ORDER BY RANDOM() LIMIT 1"
	this.db.get(stmt, function(err, row) {
		console.log(row)
		if (row)
			callback(row)
	})

};

Database.prototype.getStats = function(room, callback) {
	var self = this
	var returnData = {
		room: room
	}
	// Lets go on another ride
	this.db.serialize()
	this.getVideoStats(function(data) {
		returnData["userVideoStats"] = data
		self.getChatStats(function(data) {
			returnData["userChatStats"] = data
			self.getPopularVideos(function(data) {
				returnData["popularVideos"] = data
				self.getAverageUsers(function(data) {
					returnData["averageUsers"] = data
					callback(returnData)
					self.db.parallelize()
				})
			})
		})
	})
};

Database.prototype.getVideos = function(num, callback) {
	if (!num)
		num = 1
	var stmt = this.db.prepare("SELECT type, id, duration_ms FROM videos " +
		"WHERE flags = 0 AND duration_ms < 600000 AND (type = 'yt' OR type = 'dm' OR type = 'vm') " +
		"ORDER BY RANDOM() LIMIT ?", [num])

	stmt.all(function(err, rows) {
		callback(rows)
	})
};

Database.prototype.getVideosCount = function(callback) {
	this.db.get("SELECT count(*) AS count FROM videos", function(err, row) {
		if (err) {
			console.log(err)
			return
		}
		callback(row["count"])
	})
};

Database.prototype.getVideoStats = function(callback) {
	var select_cls = "SELECT uname, count(*) AS count FROM video_stats vs, videos v "
	var where_cls = " WHERE vs.type = v.type AND vs.id = v.id AND NOT v.flags & 2 "
	var group_cls = " GROUP BY uname ORDER BY count(*) DESC"
	var sql = select_cls + where_cls + group_cls
	var stmt = this.db.prepare(sql)
	var returnData = new Array()

	stmt.all(function(err, rows) {
		if (err)
			return

		// Format data for google charts
		for (var i = 0; i < rows.length; i++) {
			if (rows[i]["uname"] !== "")
				returnData.push([rows[i]["uname"], rows[i]["count"]])
		}
		callback(returnData)
	})
};

Database.prototype.getVideoFlag = function(type, id, callback) {
	stmt = this.db.prepare("SELECT flags FROM videos videos WHERE type = ? AND id = ?", [type, id])

	stmt.get(function(err, row) {
		if (row) {
			callback(row)
		} else {
			callback(0)
		}
	})
};