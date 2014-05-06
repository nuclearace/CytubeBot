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

Database.prototype.insertChat = function(data, room) {
	var stmt = this.db.prepare("INSERT INTO chat VALUES(?, ?, ?, ?)", [data["time"], data["username"], data["msg"], room])
	stmt.run()

	stmt.finalize()
};