var CytubeBot = require("./cytubebot")
var Config = require("./config")
var fs = require("fs")

Config.load(function (config) {
	bot = CytubeBot.init(config);
	bot.start();

	bot.socket.on("chatMsg", function (data) {
		bot.handleChatMsg(data);
	});
});