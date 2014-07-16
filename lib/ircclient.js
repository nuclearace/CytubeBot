var irc = require("irc")
var commands = require("./chatcommands")

module.exports = {
	init: function(ircInfo, bot) {
		bot.logger.syslog.log("Starting IRC")
		var client = new IRCClient(ircInfo, bot)
		return client
	}
}

function IRCClient(ircInfo, bot) {
	var self = this
	this.bot = bot
	this.ircServer = ircInfo["server"]
	this.nick = ircInfo["nick"]
	this.channel = ircInfo["channel"]
	this.pass = ircInfo["pass"]

	this.client = new irc.Client(this.ircServer, this.nick, {
		debug: true,
		userName: "CytubeBot",
		autoConnect: false,
		channels: [self.channel]
	})

	this.client.addListener("message" + this.channel, function(from, message) {
		self.handleIRCMessage(from, message)
	})

	this.client.addListener("error", function(error) {
		self.bot.logger.errlog.log("I~~~I: " + error)
	})
};

// Handles messages from the IRC server
// from - Who sent the message
// message - The actual message
IRCClient.prototype.handleIRCMessage = function(from, message) {
	this.bot.logger.cytubelog.log("IRC Message: " + from + ": " + message)
	this.bot.sendChatMsg("(" + from + "): " + message)
	if (message.indexOf("$") === 0 && from != this.nick && this.bot.doneInit) {
		commands.handle(this.bot, from, message, true)
	}
};

// Sends a message over IRC
// message - The message to send
IRCClient.prototype.sendMessage = function(message) {
	this.client.say(this.channel, message)
};

// Starts the connection to the server
IRCClient.prototype.start = function() {
	var self = this
	this.client.connect()
	if (this.pass) {
		setTimeout(function() {
			self.client.say("NickServ", "IDENTIFY " + self.pass)
		}, 5000)
	}
};