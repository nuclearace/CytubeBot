var io = require("socket.io-client")
var commands = require("./chatcommands")
var utils = require("./utils")
var Database = require("./database")

module.exports = {
	init: function(cfg) {
		console.log("Starting bot");
		var bot = new CytubeBot(cfg);
		return bot
	}
}

function CytubeBot(config) {
	this.socket = io.connect(config["server"]);
	this.username = config["username"];
	this.pw = config["pw"];
	this.room = config["room"];
	this.userlist = {};
	this.wolfram = config["wolfram"]
	this.muted = false;

	this.db = Database.init();
};

CytubeBot.prototype.getQuote = function(nick) {
	var bot = this
	this.db.getQuote(nick, function (row) {
		if (row === 0)
			return
		var nick = row["username"]
		var msg = row["msg"]
		msg = msg.replace(/&#39;/, "'")
		msg = msg.replace(/&amp;/, "&")
		msg = msg.replace(/&lt;/, "<")
		msg = msg.replace(/&gt;/, ">")
		msg = msg.replace(/&quot;/, "\"")
		msg = msg.replace(/&#40;/, "\(")
		msg = msg.replace(/&#41;/, "\)")
		msg = msg.replace(/(<([^>]+)>)/ig, "")
		msg = msg.replace(/^[ \t]+/, "")
		var time = row["timestamp"]
		var timestamp = new Date(time).toTimeString().split(" ")
		bot.sendChatMsg("[" + nick + " " + timestamp[0] + " " + timestamp[2] + "] " + msg)
		})
};

CytubeBot.prototype.handleAddUser = function(data) {
	var index = utils.handle(this, "findUser", data["name"])
	this.db.insertUser(data["name"])
	if (!index) {
		this.userlist.push(data);
		console.log("Added User: " + data["name"])
		console.log("Userlist has : " + bot.userlist.length + " users")
	}
};

CytubeBot.prototype.handleChatMsg = function(data) {
	var username = data.username;
	var msg = data.msg;
	var time = data.time + 5000;
	var timeNow = new Date().getTime();
	
	msg = msg.replace(/&#39;/, "'")
	msg = msg.replace(/&amp;/, "&")
	msg = msg.replace(/&lt;/, "<")
	msg = msg.replace(/&gt;/, ">")
	msg = msg.replace(/&quot;/, "\"")
	msg = msg.replace(/&#40;/, "\(")
	msg = msg.replace(/&#41;/, "\)")
	msg = msg.replace(/(<([^>]+)>)/ig, "")
	msg = msg.replace(/^[ \t]+/, "")
	if (!msg)
		return
	console.log("Chat Message: " + username + ": " + msg)

	// Try to avoid old commands from playback
	if (time < timeNow)
		return

	if (msg.indexOf("$") === 0 && username != this.username) {
		commands.handle(this, username, msg);
		return
	}

	this.db.insertChat(msg, time, username, this.room)
};

CytubeBot.prototype.handleUserLeave = function(user) {
	var index = utils.handle(this, "findUser", user)
	if (index) {
		this.userlist.splice(index, 1);
		console.log("Removed user: " + user)
		console.log("Userlist has : " + bot.userlist.length + " users")
	}
};

CytubeBot.prototype.handleUserlist = function(userlistData) {
	this.userlist = userlistData;
};

CytubeBot.prototype.sendChatMsg = function(message) {
	if (!this.muted)
		this.socket.emit("chatMsg", {msg: message});
};

CytubeBot.prototype.start = function() {
	this.socket.emit("initChannelCallbacks");
	this.socket.emit("joinChannel", {name: this.room});
	this.socket.emit("login", {name: this.username, pw: this.pw})
};