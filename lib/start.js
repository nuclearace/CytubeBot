var CytubeBot = require("./cytubebot")
var Config = require("./config")

process.on("exit", function() {
	console.log("\n!~~~! CytubeBot is shutting down\n")
})

var bot = {}
Config.load(function(config) {
	bot = CytubeBot.init(config)

	// Join the room
	if (bot.socket)
		bot.start()
})