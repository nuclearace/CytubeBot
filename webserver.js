var express = require("express")
var sendJade = require("./jade").sendJade

module.exports = {
	init: function(bot) {
		var server = new Server(bot)
		return server
	}
}

	function Server(bot) {
		this.webServer = express()
		this.bot = bot
		var io_URL = bot.webURL + ":" + bot.socketPort
		var socket_io = io_URL + "/socket.io/socket.io.js"
		this.webServer.use(express.static(__dirname + '/www'))

		this.webServer.get("/", function(req, res) {
			sendJade(res, "stats", {
				serverIO: socket_io
			})
		})

		this.webServer.get("/sioconfig", function(req, res) {
			res.send("var IO_URL =" + "'" + io_URL + "'")
		})

		if (!bot.webPort)
			this.webServer.listen(8080)
		
		this.webServer.listen(bot.webPort)
	}