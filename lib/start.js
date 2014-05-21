var CytubeBot = require("./cytubebot")
var Config = require("./config")
var fs = require("fs")

process.on("exit", function() {
	console.log("\n!~~~! CytubeBot is shutting down\n")
})

Config.load(function(config) {
	var bot = CytubeBot.init(config);

	// Join the room
	if (bot.socket)
		bot.start()
});