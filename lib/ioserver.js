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
		socket.on("getStats", function() {
			ioServer.getStats(function(data) {
				socket.emit("roomStats", data)
			})
		})

		socket.on("getEmotes", function() {
			ioServer.getEmotes(function(emotes) {
				socket.emit("emotes", emotes)
			})
		})

		socket.on("getRoom", function() {
			ioServer.getRoom(function(room) {
				socket.emit("room", room)
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