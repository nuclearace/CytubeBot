var CytubeBot = require("./CytubeBot");
var Config = require("./config");
var fs = require("fs");

Config.load(function (config) {
	console.log(config);
	bot = CytubeBot.init(config);
	bot.start();
});