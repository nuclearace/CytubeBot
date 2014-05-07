var CytubeBot = require("./cytubebot")
var Config = require("./config")
var fs = require("fs")

Config.load(function(config) {
	bot = CytubeBot.init(config);
	bot.start();

	bot.socket.on("chatMsg", function(data) {
		bot.handleChatMsg(data)
	});

	bot.socket.on("userlist", function(data) {
		bot.handleUserlist(data)
	});

	bot.socket.on("userLeave", function(data) {
		bot.handleUserLeave(data["name"])
	});

	bot.socket.on("addUser", function(data) {
		bot.handleAddUser(data)
	});
});