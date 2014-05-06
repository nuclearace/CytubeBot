var io = require("socket.io-client")

module.exports = {
	init: function(cfg) {
		console.log("Starting bot");
		var bot = new CytubeBot(cfg);
		return bot
	}
}

function CytubeBot(config) {
	socket = io.connect(config["server"]);
	this.username = config["username"];
	this.pw = config["pw"];
	this.room = config["room"];
};

CytubeBot.prototype.start = function() {
	socket.emit("initChannelCallbacks");
	socket.emit("joinChannel", {name: this.room});
	socket.emit("login", {name: this.username, pw: this.pw})
};