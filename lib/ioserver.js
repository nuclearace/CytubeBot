var sio = require("socket.io")

module.exports = {
	init: function(srv, bot) {
		var io = new IOServer(srv, bot)
		return io
	}
}

function IOServer(srv, bot) {
	var ioServer = this
	var io = sio.listen(srv)
	this.bot = bot
	io.sockets.on("connection", function(socket) {
		socket.on("getEmotes", function() {
			ioServer.getEmotes(function(emotes) {
				socket.emit("emotes", emotes)
			})
		})

		socket.on("getInternals", function() {
			ioServer.handleInternals(socket)
		})

		socket.on("getRoom", function() {
			ioServer.getRoom(function(room) {
				socket.emit("room", room)
			})
		})

		socket.on("getStats", function() {
			ioServer.getStats(function(data) {
				socket.emit("roomStats", data)
			})
		})
	})
};

IOServer.prototype.getEmotes = function(callback) {
	callback(this.bot.channelEmotes)
};

IOServer.prototype.getRoom = function(callback) {
	callback(this.bot.room)
};

IOServer.prototype.getStats = function(callback) {
	this.bot.getStats(function(data) {
		callback(data)
	})
};

IOServer.prototype.handleInternals = function(socket) {
	var status = this.bot.stats
	var userlist = this.bot.userlist
	var playlist = this.bot.playlist
	var processInfo = process.memoryUsage()
	var botInfo = {
		server: this.bot.cytubeServer,
		room: this.bot.room,
		username: this.bot.username,
		useLogger: this.bot.useLogger,
		deleteIfBlockedIn: this.bot.deleteIfBlockedIn,
		socketPort: this.bot.socketPort,
		webURL: this.bot.webURL,
		webPort: this.bot.webPort,
		previousUID: this.bot.previousUID,
		currentUID: this.bot.currentUID,
		currentMedia: this.bot.currentMedia,
		isLeader: this.bot.isLeader,
		startTime: this.bot.startTime,
		heapTotal: processInfo["heapTotal"],
		heapUsed: processInfo["heapUsed"]
	}

	// Hide IP
	for (var i = 0; i < userlist.length; i++) {
		delete userlist[i]["meta"]["ip"]
		delete userlist[i]["meta"]["aliases"]
		delete userlist[i]["meta"]["smuted"]
	}

	socket.emit("botStatus", status)
	socket.emit("userlist", userlist)
	socket.emit("playlist", playlist)
	socket.emit("botInfo", botInfo)
};