var express = require("express")
var path = require("path")
var sendJade = require("./jade").sendJade
var fs = require("fs")

module.exports = {
	init: function(bot) {
		var server = new Server(bot)
		return server
	}
};

function Server(bot) {
	var self = this
	this.webServer = express()
	this.bot = bot
	var io_URL = bot.webURL + ":" + bot.socketPort
	var socket_io = io_URL + "/socket.io/socket.io.js"
	this.webServer.use(express.static(path.join(__dirname, "..", "www")))

	this.webServer.get("/", function(req, res) {
		sendJade(res, "stats", {
			serverIO: socket_io
		})
	})

	this.webServer.get("/emotes", function(req, res) {
		sendJade(res, "emotes", {
			serverIO: socket_io
		})
	})

	this.webServer.get("/internals", function(req, res) {
		sendJade(res, "internals", {
			serverIO: socket_io
		})
	})

	this.webServer.get("/logs", function(req, res) {
		sendJade(res, "logs")
	})

	this.webServer.get("/logs/syslog", function(req, res) {
		self.readLog(path.join(__dirname, "..", "sys.log"), res)
	})

	this.webServer.get("/logs/cytubelog", function(req, res) {
		self.readLog(path.join(__dirname, "..", "cytubelog.log"), res)
	})

	this.webServer.get("/logs/errlog", function(req, res) {
		self.readLog(path.join(__dirname, "..", "error.log"), res)
	})

	this.webServer.get("/sioconfig", function(req, res) {
		res.send("var IO_URL =" + "'" + io_URL + "'")
	})

	if (!bot.webPort)
		this.webServer.listen(8080)

	this.webServer.listen(bot.webPort)
};

Server.prototype.readLog = function(file, res) {
	var length = 1048576
	fs.stat(file, function(err, data) {
		if (err)
			return res.send(500)

		var start = Math.max(0, data.size - length)
		if (isNaN(start))
			res.send(500)

		var end = Math.max(0, data.size - 1)
		if (isNaN(end))
			res.send(500)

		fs.createReadStream(file, {
			start: start,
			end: end
		}).pipe(res)
	})
};