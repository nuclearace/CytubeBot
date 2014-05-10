var CytubeBot = require("./cytubebot")
var Config = require("./config")
var fs = require("fs")

process.on("exit", function() {
	console.log("\n!~~~! CytubeBot is shutting down\n")
})

Config.load(function(config) {
	bot = CytubeBot.init(config);

	// Socket handlers
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

	bot.socket.on("playlist", function(data) {
		bot.handlePlaylist(data)
	})

	bot.socket.on("queue", function(data) {
		bot.handleAddMedia(data)
	})

	bot.socket.on("delete", function(data) {
		bot.handleDeleteMedia(data)
	})

	bot.socket.on("moveVideo", function(data) {
		bot.handleMoveMedia(data)
	})

	bot.socket.on("changeMedia", function(data) {
		bot.handleChangeMedia(data)
	})

	bot.socket.on("mediaUpdate", function(data) {
		bot.handleMediaUpdate(data)
	})

	bot.socket.on("needPassword", function(data) {
		bot.handleNeedPassword(data)
	})

	bot.socket.on("setTemp", function(data) {
		bot.handleSetTemp(data)
	})

	bot.start();
});