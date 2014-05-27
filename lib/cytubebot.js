var io = require("socket.io-client")
var Cleverbot = require("cleverbot-node")
var fs = require("fs")
var commands = require("./chatcommands")
var utils = require("./utils")
var Database = require("./database")
var api = require("./apiclient")
var Server = require("./webserver")
var IOServer = require("./ioserver")
var IRC = require("./ircclient")

module.exports = {
	init: function(cfg) {
		console.log("Starting bot")
		var bot = new CytubeBot(cfg)
		return bot
	}
}

// Constructor
function CytubeBot(config) {
	var bot = this

	// Begin config things

	// Cytube user info
	this.cytubeServer = config["cytubeServer"]
	this.flair = config["usemodflair"]
	this.pw = config["pw"]
	this.room = config["room"]
	this.roomPassword = config["roompassword"]
	this.username = config["username"]

	// APIs
	this.mstranslateclient = config["mstranslateclient"]
	this.mstranslatesecret = config["mstranslatesecret"]
	this.weatherunderground = config["weatherunderground"]
	this.wolfram = config["wolfram"].toLowerCase()
	this.youtubeapi = config["youtubev3"]
	// Deletes videos if blocked in this country
	this.deleteIfBlockedIn = config["deleteIfBlockedIn"].toUpperCase()

	// Webserver
	this.enableWebServer = config["enableWebServer"]
	this.socketPort = config["socketPort"]
	this.webURL = config["webURL"]
	this.webPort = config["webPort"]

	// IRC
	this.irc = {}
	this.useIRC = config["useIRC"]
	this.ircServer = config["ircServer"]
	this.ircChannel = config["ircChannel"]
	this.ircNick = config["ircNick"]
	this.ircPass = config["ircPass"]
	// End config things

	// Channel data
	this.channelOpts = {}
	this.userlist = {}
	this.playlist = []
	this.previousUID = null
	this.currentMedia = {};
	this.currentUID = null
	this.firstChangeMedia = true

	// Cooldown times
	this.timeSinceLastWeather = 0
	this.timeSinceLastSquee = 0
	this.timeSinceLastTalk = 0
	this.timeSinceLastAnagram = 0
	this.timeSinceLastTranslate = 0

	// Bot data
	this.socket = this.getSocketURL(this.cytubeServer)
	this.startTime = new Date().getTime()
	this.db = Database.init()
	this.talkBot = new Cleverbot()
	this.doneInit = false
	this.stats = {
		"managing": false,
		"muted": false,
		"hybridMods": {},
		"userLimit": false,
		"userLimitNum": 10
	}
	this.readPersistentSettings(function(err) {
		if (err)
			bot.writePersistentSettings()

		bot.updatePersistentSettings()
	})

	// Webserver
	if (this.enableWebServer) {
		this.server = Server.init(this)
		this.ioServer = IOServer.init(this.socketPort, this)
	}

	// IRC connection
	if (this.useIRC) {
		if (this.ircChannel.indexOf("#") !== 0)
			this.ircChannel = "#" + this.ircChannel
		var ircInfo = {
			"server": this.ircServer,
			"channel": this.ircChannel,
			"nick": this.ircNick,
			"pass": this.ircPass
		}
		this.irc = IRC.init(ircInfo, this)
	}

	// Add handlers
	if (this.socket)
		this.addHandlers()
};

// Adds the socket listeners
// Moved from start because socketioURL fetching
CytubeBot.prototype.addHandlers = function() {
	var bot = this

	// Socket handlers
	bot.socket.on("addUser", function(data) {
		bot.handleAddUser(data)
	})

	bot.socket.on("channelOpts", function(data) {
		bot.handleChannelOpts(data)
	})

	bot.socket.on("changeMedia", function(data) {
		bot.handleChangeMedia(data)
	})

	bot.socket.on("chatMsg", function(data) {
		bot.handleChatMsg(data)
	})

	bot.socket.on("delete", function(data) {
		bot.handleDeleteMedia(data)
	})

	bot.socket.on("disconnect", function() {
		setTimeout(function() {
			process.exit(0)
		}, 10000)
	})

	bot.socket.on("mediaUpdate", function(data) {
		bot.handleMediaUpdate(data)
	})

	bot.socket.on("moveVideo", function(data) {
		bot.handleMoveMedia(data)
	})

	bot.socket.on("needPassword", function(data) {
		bot.handleNeedPassword(data)
	})

	bot.socket.on("playlist", function(data) {
		bot.handlePlaylist(data)
	})

	bot.socket.on("queue", function(data) {
		bot.handleAddMedia(data)
	})

	bot.socket.on("setCurrent", function(data) {
		bot.handleSetCurrent(data)
	})

	bot.socket.on("setTemp", function(data) {
		bot.handleSetTemp(data)
	})

	bot.socket.on("setUserRank", function(data) {
		bot.handleSetUserRank(data)
	})

	bot.socket.on("usercount", function(data) {
		bot.storeUsercount(data)
	})

	bot.socket.on("userLeave", function(data) {
		bot.handleUserLeave(data["name"])
	})

	bot.socket.on("userlist", function(data) {
		bot.handleUserlist(data)
	})
};

// Adds random videos using the database
// num - Number of random videos to add
CytubeBot.prototype.addRandomVideos = function(num) {
	var bot = this
	if (this.db) {
		this.db.getVideos(num, function(rows) {
			for (var i in rows) {
				var type = rows[i]["type"]
				var id = rows[i]["id"]
				var duration = rows[i]["duration_ms"] / 1000
				bot.addVideo(type, id, duration)
			}
		})
	}
};

// Sends a queue frame to the server
// type - the type of media ie. yt
// duration - the duration of the video, in seconds. Not really used atm
// temp - whether to add the media as temporary or not
// parsedLink - param used when $add is called
CytubeBot.prototype.addVideo = function(type, id, duration, temp, parsedLink) {
	var json = {}

	if (!temp)
		temp = false

	if (!parsedLink) {
		json = {
			"id": id,
			"type": type,
			"pos": "end",
			"duration": 0,
			"temp": temp
		}
		console.log("!~~~! Adding a video " + json["id"])
		this.socket.emit("queue", json)
	} else {
		json = {
			"id": parsedLink["id"],
			"type": parsedLink["type"],
			"pos": "end",
			"duration": 0,
			"temp": temp
		}
		console.log("!~~~! Adding a video " + json["id"])
		this.socket.emit("queue", json)
	}
};

// Used by $blacklist and blockUser()
// Blacklists the current video or uid
// uid - A video we want to delete
// callback - The callback function
CytubeBot.prototype.blacklistVideo = function(uid, callback) {
	var type
	var id
	var flags = 1
	var title

	if (typeof uid !== "undefined") {
		var video = utils.handle(this, "getVideoFromUID", uid)
		type = video["media"]["type"]
		id = video["media"]["id"]
		title = video["media"]["title"]
		this.db.flagVideo(type, id, flags, title)
		return callback()
	}

	type = this.currentMedia["type"]
	id = this.currentMedia["id"]
	flags = 1
	title = this.currentMedia["title"]

	this.db.flagVideo(type, id, flags, title)
};

// Blocks/unblocks a user from adding videos
// username - The user we are blocking/unblocking
// flag - The value. true/false
CytubeBot.prototype.blockUser = function(username, flag) {
	var bot = this
	if (!username || typeof flag === "undefined")
		return

	var deleteFun = function() {
		bot.deleteVideo(uids[i])
	}

	this.db.insertUserBlock(username, flag)

	if (flag) {
		var uids = utils.handle(this, "findVideosAddedByUser", username)
		for (var i = 0; i < uids.length; i++) {
			this.blacklistVideo(uids[i], deleteFun)
		}
	}
};

// Used by $autodelete
// Makes it so the current video cannot be added by non-mods
CytubeBot.prototype.blockVideo = function() {
	var type = this.currentMedia["type"]
	var id = this.currentMedia["id"]
	var uid = this.currentUID
	var flags = 2
	var title = this.currentMedia["title"]

	this.db.flagVideo(type, id, flags, title)
	this.deleteVideo(uid)
};

// Checks if the user has a given permission
// Returns that users permission info
// username - The user we're looking up
// permission - The permission to look up 
CytubeBot.prototype.checkPermission = function(username, permission) {
	var permissionData = {
		permission: permission,
		name: username.toLowerCase()
	}

	try {
		return utils.handle(this, "userHasPermission", permissionData)["hasPermission"]
	} catch (e) {
		return false
	}
};

// Checks if users have too many items on the playlist
// And if so, delete them 
CytubeBot.prototype.checkPlaylist = function() {
	var bot = this
	if (this.stats["userLimit"]) {
		for (var i = 0; i < this.userlist.length; i++) {
			if (this.userlist[i]["addedMedia"].length >= this.stats["userLimitNum"]) {

				// How many should we delete
				var numDelete = this.userlist[i]["addedMedia"].length - this.stats["userLimitNum"]
				var uids = bot.userlist[i]["addedMedia"].reverse()

				// Delete the videos
				for (var u = 0; u < numDelete; u++) {
					bot.deleteVideo(uids[u])
				}
			}
		}
	}
};

// Checks whether a user is blocked from adding videos or not
// username - The user to lookup
// callback - The callback function
CytubeBot.prototype.checkUserBlock = function(username, callback) {
	if (!username)
		return

	this.db.getUserBlock(username, function(flag) {
		if (flag === "1")
			callback(true)
	})
};

// Gets the videos added by username
// Adds to their userlist.item.addedMedia
// If no username is given we check the whole playlist
// username - The user we are adding videos to
CytubeBot.prototype.countVideosAddedByUser = function(username) {
	if (!username) {
		for (var i = 0; i < this.userlist.length; i++) {
			var uids = utils.handle(this, "findVideosAddedByUser", this.userlist[i]["name"])
			this.userlist[i]["addedMedia"] = uids
		}
		return
	}
	var pos = utils.handle(this, "findUser", username)
	this.userlist[pos]["addedMedia"] = utils.handle(this, "findVideosAddedByUser", username)
};

// Used by $poll
// Sends a newPoll frame to the server
// This will create a new poll
// poll - Poll object
CytubeBot.prototype.createPoll = function(poll) {
	this.socket.emit("newPoll", poll)
};

// Used by various methods
// Sends a delete frame to the server
// uid - The uid of the video to delete
CytubeBot.prototype.deleteVideo = function(uid) {
	console.log("!~~~! Sending delete frame for uid: " + uid)
	this.socket.emit("delete", uid)
};

// WARNING - This is experimental
// Deletes videos from the database that are like like
// like - What to match. Example: %skrillex% will delete all videos
// with the word "skrillex" in it
CytubeBot.prototype.deleteVideosFromDatabase = function(like) {
	var bot = this
	this.db.deleteVideos(like, function(num) {
		bot.sendChatMsg("Deleted: " + num + " videos")
	})
};

// Used by $endpoll
// Sends a closePoll frame to the server
// Closes a poll
CytubeBot.prototype.endPoll = function() {
	this.socket.emit("closePoll")
};

// Used by $quote
// Fetches a quote from database. If no nick is given, it will
// get a random quote.
// nick - the nickname of the user to get quotes from
CytubeBot.prototype.getQuote = function(nick) {
	var bot = this
	this.db.getQuote(nick, function(row) {
		if (row === 0)
			return
		var nick = row["username"]
		var msg = row["msg"]
		msg = msg.replace(/&#39;/g, "'")
		msg = msg.replace(/&amp;/g, "&")
		msg = msg.replace(/&lt;/g, "<")
		msg = msg.replace(/&gt;/g, ">")
		msg = msg.replace(/&quot;/g, "\"")
		msg = msg.replace(/&#40;/g, "\(")
		msg = msg.replace(/&#41;/g, "\)")
		msg = msg.replace(/(<([^>]+)>)/g, "")
		msg = msg.replace(/^[ \t]+/g, "")
		var time = row["timestamp"]
		var timestamp = new Date(time).toDateString() + " " +
			new Date(time).toTimeString().split(" ")[0]
		bot.sendChatMsg("[" + nick + " " + timestamp + "] " + msg)
	})
};

// Gets the Cytube socketIO port
// server - The input from config.json 
CytubeBot.prototype.getSocketURL = function(server) {
	var bot = this
	var defaultReg = new RegExp("(https?:\/\/)?(.*:\d*)")
	if (server.match(defaultReg)) {
		return io.connect(server)
	} else {
		api.APICall(server, "socketlookup", null, function(data) {
			if (data.match(defaultReg)) {
				bot.socket = io.connect(data)
				bot.addHandlers()
				bot.start()
			}
		})
	}
	return
};

// Gets the required stats 
CytubeBot.prototype.getStats = function(callback) {
	this.db.getStats(this.room, function(data) {
		callback(data)
	})
};

// Handles queue frams from the server
// data - the queue data
CytubeBot.prototype.handleAddMedia = function(data) {
	var bot = this

	// See if we should delete this video right away
	// because that user has too many videos
	var pos = utils.handle(this, "findUser", data["item"]["queueby"])
	if (typeof pos !== "undefined") {
		if (this.stats["userLimit"] && this.userlist[pos]["addedMedia"].length >= this.stats["userLimitNum"]) {
			this.deleteVideo(data["item"]["uid"])
			return
		}
		this.userlist[pos]["addedMedia"].push(data["item"]["uid"])
	}

	if (this.playlist.length === 0) {
		this.playlist = [data["item"]]
	} else {
		var uid = data["after"]
		var index = utils.handle(this, "findIndexOfVideoFromUID", uid)
		console.log("### Adding video after: " + index)
		this.playlist.splice(index + 1, 0, data["item"])
	}

	this.validateVideo(data["item"], function(block, uid) {
		if (block) {
			bot.deleteVideo(uid)
			return
		}
	})
};

// Handles addUser frames from the server
// data - addUser data
CytubeBot.prototype.handleAddUser = function(data) {
	var inList = utils.handle(this, "userInUserlist", data["name"])
	this.db.insertUser(data["name"])
	if (!inList) {
		this.userlist.push(data)
		console.log("Added User: " + data["name"])
		console.log("Userlist has : " + this.userlist.length + " users")
		this.countVideosAddedByUser(data["name"])
	}
};

// Handles a channelOpts frame from the server
// This includes skip ratio, media limt, and other info
// opts - The channel options
CytubeBot.prototype.handleChannelOpts = function(opts) {
	if (opts)
		this.channelOpts = opts
};

// Handles changeMedia frames from the server
// If the bot is managing the playlist and the last video was not
// temporary it sends a delete frame.
// data - changeMedia data
CytubeBot.prototype.handleChangeMedia = function(data) {
	if (this.stats["managing"] && this.doneInit && !this.firstChangeMedia && this.playlist.length !== 0) {
		var temp = true
		var uid = this.previousUID

		// Try our best to find out if the video is temp
		// If we get an exception it's because the media was deleted
		try {
			if (typeof uid !== "undefined")
				temp = utils.handle(this, "getVideoFromUID", uid)["temp"]
		} catch (e) {
			console.log("!~~~! Media deleted. handleChangeMedia lookup temp failed")
		}
		if (typeof uid !== "undefined" && !temp)
			this.deleteVideo(uid)
	}
	this.currentMedia = data
	this.firstChangeMedia = false
	console.log("### Current Video now " + this.currentMedia["title"])
};

// Handles delete frames from the server
// If there are no more videos in the playlist and
// we are managing, add a random video
// data - delete data
CytubeBot.prototype.handleDeleteMedia = function(data) {
	var uid = data["uid"]
	var index = utils.handle(this, "findIndexOfVideoFromUID", uid)

	if (typeof index !== "undefined") {
		console.log("#~~~# Deleting media at index: " + index)
		var addedBy = utils.handle(this, "getVideoFromUID", uid)["queueby"]
		var pos = utils.handle(this, "findUser", addedBy)
		if (typeof pos !== "undefined") {
			// Remove the media from the user's addedMedia
			this.userlist[pos]["addedMedia"].splice(this.userlist[pos]["addedMedia"].indexOf(uid), 1)
		}
		this.playlist.splice(index, 1)
		if (this.playlist.length === 0 && this.stats["managing"])
			this.addRandomVideos()
	}
};

// Used by $permissions
// Handles a change in hybridMods or calls sendHybridModPermissions if no permission
// is given.
// permission - The permission we are changing, or undefined if there is none
// name - name of the user we want to change permissions for, or look up 
CytubeBot.prototype.handleHybridModPermissionChange = function(permission, name) {
	if (!permission) {
		this.sendHybridModPermissions(name)
		return
	}

	var change = permission.substring(0, 1)
	permission = permission.substring(1, permission.length).trim()

	if (!(name in this.stats["hybridMods"]) && change === "+") {
		this.stats["hybridMods"][name] = permission
		this.sendHybridModPermissions(name)
		this.writePersistentSettings()
		return
	}

	var permissionData = {
		permission: permission,
		name: name
	}
	var hasPermission = utils.handle(this, "userHasPermission", permissionData)

	if (hasPermission["hasPermission"]) {
		var permissions = hasPermission["permissions"]
		if (change === "-") {
			for (var i = 0; i < permissions.length; i++) {
				this.stats["hybridMods"][name] = this.stats["hybridMods"][name].replace(permissions[i], "")
			}
		}
	} else if (change === "+") {
		if (permission === "ALL") {
			this.stats["hybridMods"][name] = ""
			this.stats["hybridMods"][name] = permission
		} else {
			this.stats["hybridMods"][name] += permission
		}
	} else if (change === "-" && permission === "ALL") {
		this.stats["hybridMods"][name] = ""
	}

	if (this.stats["hybridMods"][name] === "")
		delete this.stats["hybridMods"][name]

	this.sendHybridModPermissions(name)
	this.writePersistentSettings()
};

// Handles mediaUpdate frames from the server
// If we are managing and the playlist only has one item
// and the video is about to end, we add a random video 
CytubeBot.prototype.handleMediaUpdate = function(data) {
	console.log("### Current video time: " + data["currentTime"] + " Paused: " + data["paused"])
	var doSomething = (this.currentMedia["seconds"] - data["currentTime"]) < 6 && this.playlist.length === 1 && this.stats["managing"]
	if (doSomething) {
		console.log("Shit son, we gotta do something, the video is ending")
		this.addRandomVideos()
	}
};

// Handles moveVideo frames from the server
// data - moveMedia data
CytubeBot.prototype.handleMoveMedia = function(data) {
	var from = data["from"]
	var after = data["after"]
	var fromIndex = utils.handle(this, "findIndexOfVideoFromUID", from)

	// Remove video
	var removedVideo = this.playlist.splice(fromIndex, 1)
	var afterIndex = utils.handle(this, "findIndexOfVideoFromUID", after)

	// And add it in the new position
	this.playlist.splice(afterIndex + 1, 0, removedVideo[0])

	console.log("### Moving video from: " + fromIndex + " after " + afterIndex)
};

// Handles chatMsg frames from the server
// If the first character of the msg is $, we interpet it as a command.
// We ignore chat from before the bot was started, in order to avoid old
// commands. 
CytubeBot.prototype.handleChatMsg = function(data) {
	var username = data.username
	var msg = data.msg
	var time = data.time

	// Ignore server messages
	if (username === "[server]")
		return

	msg = msg.replace(/&#39;/g, "'")
	msg = msg.replace(/&amp;/g, "&")
	msg = msg.replace(/&lt;/g, "<")
	msg = msg.replace(/&gt;/g, ">")
	msg = msg.replace(/&quot;/g, "\"")
	msg = msg.replace(/&#40;/g, "\(")
	msg = msg.replace(/&#41;/g, "\)")
	msg = msg.replace(/(<([^>]+)>)/ig, "")
	msg = msg.replace(/^[ \t]+/g, "")
	if (!msg)
		return
	console.log("Chat Message: " + username + ": " + msg)
	if (this.useIRC && this.doneInit && msg.indexOf("(") !== 0)
		this.irc.sendMessage("(" + username + "): " + msg)

	// Try to avoid old commands from playback
	if (time < this.startTime)
		return

	if (msg.indexOf("$") === 0 && username.toLowerCase() != this.username.toLowerCase() && this.doneInit) {
		commands.handle(this, username, msg)
		return
	}

	this.db.insertChat(msg, time, username, this.room)
};

// Handles playlist frames from the server and validates the videos
// playlist - playlist data
CytubeBot.prototype.handlePlaylist = function(playlist) {
	var bot = this
	for (var i = 0; i < this.userlist.length; i++) {
		this.userlist[i]["addedMedia"] = []
	}

	var callbackFunction = function(block, uid) {
		if (block)
			bot.deleteVideo(uid)
	}

	this.playlist = playlist
	this.countVideosAddedByUser()
	if (this.playlist.length === 0 && this.stats["managing"])
		this.addRandomVideos()

	for (var u in playlist) {
		this.validateVideo(playlist[u], callbackFunction)
	}
};

// Handles needPassword frames from the server
// needPasswords are sent when the room we are trying to join has a password
CytubeBot.prototype.handleNeedPassword = function() {
	if (this.roomPassword) {
		console.log("!~~~! Room has password, sending password")
		this.socket.emit("channelPassword", this.roomPassword)
		this.roomPassword = null
	} else {
		console.log("\n!~~~! No room password in config.json or password is wrong. Killing bot!\n")
		process.exit(1)
	}
};

// Handles setCurrent frames from the server
// This is a better way of handling the current media UID problem
// uid - UID of the current video
CytubeBot.prototype.handleSetCurrent = function(uid) {
	if (this.currentUID === null) {
		this.currentUID = uid
		this.previousUID = uid
	} else {
		this.previousUID = this.currentUID
		this.currentUID = uid
	}
};

// Handles setTemp frames from the server
// data - setTemp data
CytubeBot.prototype.handleSetTemp = function(data) {
	var temp = data["temp"]
	var uid = data["uid"]

	var index = utils.handle(this, "findIndexOfVideoFromUID", uid)
	console.log("### Setting temp: " + temp + " on video at index " + index)
	this.playlist[index]["temp"] = temp
};

// Handles setUserRank frames from the server
// data - setUserRank data
CytubeBot.prototype.handleSetUserRank = function(data) {
	for (var i = 0; i < this.userlist.length; i++) {
		if (this.userlist[i]["name"].toLowerCase() === data["name"].toLowerCase()) {
			this.userlist[i]["rank"] = data["rank"]
			console.log("!~~~! Setting rank: " + data["rank"] + " on " + data["name"])
			break
		}
	}
};

// Handles userLeave frames from the server
// user - userLeave data
CytubeBot.prototype.handleUserLeave = function(user) {
	var index = utils.handle(this, "findUser", user)
	if (index) {
		this.userlist.splice(index, 1)
		console.log("Removed user: " + user)
		console.log("Userlist has : " + this.userlist.length + " users")
	}
};

// Handles userlist frames from the server
// userlistData - userlist data
CytubeBot.prototype.handleUserlist = function(userlistData) {
	this.userlist = userlistData
	this.countVideosAddedByUser()
};

// Lists all the blocked users
CytubeBot.prototype.listBlockedUsers = function() {
	var bot = this
	var blockedString = "Blocked:"
	this.db.getAllBlockedUsers(function(users) {
		if (users.length !== 0) {
			blockedString += " " + users.join(", ")
			bot.sendChatMsg(blockedString)
		} else {
			blockedString += " None"
			bot.sendChatMsg(blockedString)
		}
	})
};

// Reads the persistent settings or has the callback write the defaults
// callback - callback function, used to write the persistent settings
// if they don't exist 
CytubeBot.prototype.readPersistentSettings = function(callback) {
	var bot = this
	fs.readFile("persistent.json", function(err, data) {
		if (err) {
			return callback(true)
		} else {
			bot.stats = JSON.parse(data)
			console.log("!~~~! Read persistent settings")
			callback(false)
		}
	})
};

// Sends a chatMsg frame to the server
// If we are using modflair it will try and send meta for it
// message - message to be sent
CytubeBot.prototype.sendChatMsg = function(message) {
	var rank = 0
	if (this.doneInit)
		rank = utils.handle(this, "getUser", this.username.toLowerCase())["rank"]

	if (!this.stats["muted"]) {
		console.log("!~~~! Sending chatMsg: " + message)
		if (!this.flair)
			this.socket.emit("chatMsg", {
				msg: message,
				meta: {}
			})
		else {
			this.socket.emit("chatMsg", {
				msg: message,
				meta: {
					"modflair": rank
				}
			})
		}
	}
};

// Sends the hybridmod permissions for name
// name - name to send hybridmod permissions for
CytubeBot.prototype.sendHybridModPermissions = function(name) {
	if (name)
		this.sendChatMsg(name + ": " + this.stats["hybridMods"][name])
};

// Sends a moveMedia frame to the server
// from - The position of the video before
CytubeBot.prototype.sendMoveMedia = function(from) {
	if (typeof from !== "undefined") {
		console.log("!~~~! Sending moveMedia frame for uid: " + from)
		this.socket.emit("moveMedia", {
			from: from,
			after: this.currentUID
		})
	}
};

// Sends a chatMsg with the status of the bot
// ie. is the bot muted and managing
CytubeBot.prototype.sendStatus = function() {
	var status = "[Muted: "
	status += this.stats["muted"]
	status += "; Managing playlist: " + this.stats["managing"]
	status += "; User Media Limit: " + this.stats["userLimit"]
	status += "; User Limit Number: " + this.stats["userLimitNum"]
	status += "]"

	this.socket.emit("chatMsg", {
		msg: status,
		meta: {}
	})
};

// Used by $shuffle
// Emits a shufflePlaylist frame
CytubeBot.prototype.shufflePlaylist = function() {
	this.socket.emit("shufflePlaylist")
};

// Used to start the process of joining a channel
// Called after we have initialized the bot and set socket listeners
CytubeBot.prototype.start = function() {
	var bot = this
	this.socket.emit("initChannelCallbacks")
	this.socket.emit("joinChannel", {
		name: this.room
	})
	this.socket.emit("login", {
		name: this.username,
		pw: this.pw
	})

	// Start the connection to the IRC server
	if (this.useIRC)
		this.irc.start()

	// Wait 5 seconds before we accept chat commands
	setTimeout(function() {
		console.log("!~~~! Now handling commands")
		bot.doneInit = true
	}, 5000)
};

// Inserts the usercount into the database
// count - The number of users
CytubeBot.prototype.storeUsercount = function(count) {
	this.db.insertUsercount(count, new Date().getTime())
};

// Interacts with CleverBot
// This is being moved from api.js in order to store the sessionId of cleverbot
// This lets it hold a conversation better
// message - Message we are sending to Cleverbot
// callback - Callback function
CytubeBot.prototype.talk = function(message, callback) {
	this.talkBot.write(message, function(resp) {
		callback(resp)
	})
};

// Validates a given video to ensure that it hasn't been blocked
// or that it can be played in the country specified in deleteIfBlockedIn (if given)
// Optionally uses youtube look up if we have the apikey
// video - The video we want to validate
// callback - the callback function, usually used to initiate a deleteVideo
CytubeBot.prototype.validateVideo = function(video, callback) {
	var bot = this
	var type = video["media"]["type"]
	var id = video["media"]["id"]
	var title = video["media"]["title"]
	var dur = video["media"]["seconds"]
	var nick = video["queueby"]
	var uid = video["uid"]
	var rank = 0

	try {
		rank = utils.handle(this, "getUser", nick)["rank"]
	} catch (e) {
		console.log("!~~~! Error looking up user rank for validate video\n" +
			"      Probably from a user not on the list")
		rank = 0
	}

	if (nick.toLowerCase() !== this.username.toLowerCase())
		bot.db.insertVideo(type, id, title, dur, nick)

	this.db.getVideoFlag(type, id, function(row) {
		if (row["flags"] === 2) {
			if (rank < 2) {
				bot.sendChatMsg("*** Video blocked: " + title)
				return callback(true, uid)
			}
		}

		bot.checkUserBlock(nick, function(block) {
			if (block) {
				bot.db.flagVideo(type, id, 1, title)
				return callback(true, uid)
			}

			if (type === "yt" && bot.youtubeapi) {
				bot.validateYoutubeVideo(id, type, title, function(shouldDelete) {
					if (shouldDelete) {
						return callback(true, uid)
					}
				})
			}

		})
	})
};

// Validates a youtube video
// video - The video to validate
// callback - The callback function
CytubeBot.prototype.validateYoutubeVideo = function(id, type, title, callback) {
	var bot = this

	if (!this.youtubeapi)
		return callback(false)

	api.APICall(id, "youtubelookup", bot.youtubeapi, function(status, vidInfo) {
		if (status !== true) {
			bot.sendChatMsg("Invalid video: " + id)
			if (title)
				bot.db.flagVideo(type, id, 1, title)
			callback(true)
			return
		}

		var blocked = false
		var allowed = {}
		var shouldDelete = false

		// See what countries are blocked
		try {
			blocked = vidInfo["contentDetails"]["regionRestriction"]["blocked"]
		} catch (e) {
			blocked = false
		}

		// See what countries are allowed to embed the video
		try {
			allowed = vidInfo["contentDetails"]["regionRestriction"]["allowed"]
		} catch (e) {
			allowed = false
		}

		// Should we delete the video
		if (bot.deleteIfBlockedIn) {
			if (allowed && allowed.indexOf(bot.deleteIfBlockedIn) === -1) {
				shouldDelete = true
			} else if (blocked && blocked.indexOf(bot.deleteIfBlockedIn) !== -1) {
				shouldDelete = true
			}
		}

		if (!vidInfo["status"]["embeddable"]) {
			bot.sendChatMsg("Embedding disabled: " + id)
			if (title)
				bot.db.flagVideo(type, id, 1, title)
			callback(true)
			return
		} else if (shouldDelete) {
			bot.sendChatMsg("Video blocked in: " + bot.deleteIfBlockedIn +
				". id: " + id)
			if (title)
				bot.db.flagVideo(type, id, 1, title)
			callback(true)
			return
		}
	})
};

// Updates the persistent settings
CytubeBot.prototype.updatePersistentSettings = function() {
	if (!this.stats["hybridMods"]) {
		this.stats["hybridMods"] = {}
	}
	if (typeof this.stats["userLimit"] === "undefined") {
		this.stats["userLimit"] = false
		this.stats["userLimitNum"] = 10
	}

	this.writePersistentSettings()
};

// Writes the persistent settings
// Used by various methods
CytubeBot.prototype.writePersistentSettings = function() {
	console.log("!~~~! Writing persistent settings")
	var stringyJSON = JSON.stringify(this.stats)
	fs.writeFile("persistent.json", stringyJSON, function(err) {
		if (err) {
			console.log(err)
			process.exit(1)
		}
	})
};