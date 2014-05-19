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
	io.sockets.on('connection', function(socket) {
		socket.on('getStats', function() {
			ioServer.getStats(function(data) {
				socket.emit("roomStats", data)
			})
		})
	})
	io.set("log level", 1)
};

IOServer.prototype.getStats = function(callback) {
	this.bot.getStats(function(data) {
		callback(data)
	})
};