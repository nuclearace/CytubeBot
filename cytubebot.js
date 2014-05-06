var io = require("socket.io-client")
var commands = require("./chatcommands")

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
};

CytubeBot.prototype.handleChatMsg = function(data) {
	var username = data.username;
	var msg = data.msg;
	var time = data.time + 5000;
	var timeNow = new Date().getTime();

	// Try to avoid old commands from playback
	if (time < timeNow)
		return

	if (msg.indexOf("$") === 0 && username != this.username) {
		commands.handle(this, msg);
	}
};

CytubeBot.prototype.sendChatMsg = function(message) {
	this.socket.emit("chatMsg", {msg: message});
};

CytubeBot.prototype.start = function() {
	this.socket.emit("initChannelCallbacks");
	this.socket.emit("joinChannel", {name: this.room});
	this.socket.emit("login", {name: this.username, pw: this.pw})
};