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
	this.ircServer = this.parseServer(ircInfo["server"])
	this.nick = ircInfo["nick"]
	this.channel = ircInfo["channel"]
	this.pass = ircInfo["pass"]
	this.connected = false

	this.client = new irc.Client(this.ircServer["server"], this.nick, {
		debug: true,
		userName: "CytubeBot",
		autoConnect: false,
		channels: [self.channel],
		port: this.ircServer["port"]
	})

	this.client.addListener("message" + this.channel, function(from, message) {
		self.handleIRCMessage(from, message)
	})

	this.client.addListener("registered", function(message) {
		self.connected = true
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
	if (message.indexOf("$") === 0 && from != this.nick && this.bot.loggedIn) {
		commands.handle(this.bot, from, message, true)
	}
};

// Parses IRCserver info from config
// Used to get the port number, if specified
// server - the server string
IRCClient.prototype.parseServer = function(server) {
	var matcher = server.match(/(.*):(\d*)?/)
	var serverObject = {
		server: null,
		port: null
	}

	if (matcher) {
		serverObject["server"] = matcher[1]
		serverObject["port"] = matcher[2]
	} else {
		serverObject["server"] = server
		serverObject["port"] = 6667
	}

	return serverObject
};

// Sends a message over IRC
// message - The message to send
IRCClient.prototype.sendMessage = function(message) {
	if (this.connected)
		this.client.say(this.channel, message)
};

// Starts the connection to the server
IRCClient.prototype.start = function() {
	var self = this
	this.client.connect()
	if (this.pass) {
		if(self.connected != true) 
			return console.log("Not Connected to IRC.")
		setTimeout(function() {
			self.client.say("NickServ", "IDENTIFY " + self.pass)
		}, 5000)
	}
};
