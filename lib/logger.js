var path = require("path")
var fs = require("fs")

function getTimeString() {
	var date = new Date()
	return date.toDateString() + " " + date.toTimeString().split(" ")[0]
};

function Logger(filename) {
	this.filename = filename
	this.writer = fs.createWriteStream(filename, {
		flags: "a",
		encoding: "utf-8"
	})
	this.enabled = true
};

// Closes the writer
Logger.prototype.close = function() {
	try {
		this.writer.end()
	} catch (e) {
		errlog.log("!~~~! Log close failed: " + this.filename)
	}
};

// Write to the file
// msg - The message to be written
Logger.prototype.log = function(msg) {
	if (!this.enabled)
		return

	var str = "[" + getTimeString() + "] " + msg + "\n"

	try {
		this.writer.write(str)
	} catch (error) {
		errlog.log("!~~~! Attempted logwrite failed: " + this.filename)
		errlog.log("Message was: " + msg)
		errlog.log(e)
	}
};

function makeNewLoggerWithConsoleOutput(filename) {
	var log = new Logger(filename)
	log._log = log.log
	log.log = function() {
		console.log.apply(console, arguments)
		this._log.apply(this, arguments)
	}
	return log
};

var errlog = makeNewLoggerWithConsoleOutput(path.join(__dirname, "..", "error.log"))
var syslog = makeNewLoggerWithConsoleOutput(path.join(__dirname, "..", "sys.log"))
var cytubelog = makeNewLoggerWithConsoleOutput(path.join(__dirname, "..", "cytubelog.log"))

module.exports = {
	logger: Logger,
	errlog: errlog,
	syslog: syslog,
	cytubelog: cytubelog
};