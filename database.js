var sqlite3 = require('sqlite3')

module.exports = {
	init: function () {
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

Database.prototype.getQuote = function(nick, callback) {
	var nick = nick.split(" ")[0]
	if (nick) {
		var stmt = this.db.prepare("SELECT username, msg, timestamp FROM chat WHERE " + 
		"username = ? COLLATE NOCASE ORDER BY RANDOM() LIMIT 1", [nick])
		stmt.get(function (err, row) {
			console.log("db: " + row)
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
	this.db.get(stmt, function (err, row) {
		console.log(row)
		if (row)
			callback(row)
	})

};