var sqlite3 = require('sqlite3')

module.exports = {
	init: function() {
		var db = new Database();
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
	this.db.run("CREATE TABLE IF NOT EXISTS videos(type TEXT, id TEXT, duration_ms INTEGER, title TEXT, flags INTEGER, autodelete TEXT, primary key(type, id))")
	this.db.run("CREATE TABLE IF NOT EXISTS video_stats(type TEXT, id TEXT, uname TEXT)")
};

Database.prototype.insertUser = function(username) {
	var stmt = this.db.prepare("INSERT OR IGNORE INTO users VALUES (?, 'false', 'false')", [username])
	stmt.run()

	stmt.finalize()
};

Database.prototype.insertChat = function(msg, time, nick, room) {
	var stmt = this.db.prepare("INSERT INTO chat VALUES(?, ?, ?, ?)", [time, nick, msg, room])
	stmt.run()

	stmt.finalize()
};

Database.prototype.insertVideo = function(site, vid, title, dur, nick) {
	var stmt1 = this.db.prepare("INSERT OR IGNORE INTO videos VALUES(?, ?, ?, ?, ?, ?)", [site, vid, dur * 1000, title, 0, 'false'])
	var stmt2 = this.db.prepare("INSERT INTO video_stats VALUES(?, ?, ?)", [site, vid, nick])

	stmt1.run()
	stmt1.finalize()

	stmt2.run()
	stmt2.finalize()
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

Database.prototype.getVideos = function(num, callback) {
	if (!num)
		num = 1
	var stmt = this.db.prepare("SELECT type, id, duration_ms FROM videos WHERE flags = 0 AND duration_ms < 600000 ORDER BY RANDOM() LIMIT ?", [num])

	stmt.all(function(err, rows) {
		callback(rows)
	})
};
