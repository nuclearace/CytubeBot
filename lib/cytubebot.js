var io = require("socket.io-client")
var Cleverbot = require("cleverbot-node")
var fs = require("fs")
var commands = require("./chatcommands")
var utils = require("./utils")
var Database = require("./database")
var api = require("./apiclient")
var Server = require("./webserver")
var IOServer = require("./ioserver")

module.exports = {
	init: function(cfg) {
		console.log("Starting bot");
		var bot = new CytubeBot(cfg);
		return bot
	}
}

// Constructor
	function CytubeBot(config) {
		var bot = this
		this.socket = io.connect(config["serverio"])
		this.username = config["username"]
		this.pw = config["pw"]
		this.room = config["room"]
		this.roomPassword = config["roompassword"]
		this.userlist = {};
		this.playlist = [];
		this.previousUID = null
		this.currentMedia = {};
		this.currentUID = null
		this.wolfram = config["wolfram"].toLowerCase()
		this.weatherunderground = config["weatherunderground"]
		this.mstranslateclient = config["mstranslateclient"]
		this.mstranslatesecret = config["mstranslatesecret"]
		this.youtubeapi = config["youtubev3"]
		this.deleteIfBlockedIn = config["deleteIfBlockedIn"].toUpperCase()
		this.firstChangeMedia = true
		this.timeSinceLastWeather = 0
		this.timeSinceLastSquee = 0
		this.timeSinceLastTalk = 0
		this.timeSinceLastAnagram = 0
		this.timeSinceLastTranslate = 0
		this.flair = config["usemodflair"]
		this.startTime = new Date().getTime()
		this.doneInit = false
		this.stats = {
			"managing": false,
			"muted": false,
			"hybridMods": {}
		}

		this.readPersistentSettings(function(err) {
			if (err)
				bot.writePersistentSettings()
		})

		this.enableWebServer = config["enableWebServer"]
		this.webURL = config["webURL"]
		this.webPort = config["webPort"]
		this.socketPort = config["socketPort"]
		this.talkBot = new Cleverbot
		this.db = Database.init()
		if (this.enableWebServer) {
			this.server = Server.init(this)
			this.ioServer = IOServer.init(this.socketPort, this)
		}
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
	if (!temp) {
		temp = false
	}
	if (!parsedLink) {
		var json = {
			"id": id,
			"type": type,
			"pos": "end",
			"duration": 0,
			"temp": temp
		}
		console.log("!~~~! Adding a video " + json["id"])
		this.socket.emit("queue", json)
	} else {
		var json = {
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

// Used by $blacklist
// Blacklists the current video
CytubeBot.prototype.blacklistVideo = function() {
	var type = this.currentMedia["type"]
	var id = this.currentMedia["id"]
	var flags = 1
	var title = this.currentMedia["title"]

	this.db.blacklistVideo(type, id, flags, title)
};

// Used by $autodelete
// Makes it so the current video cannot be added by non-mods
CytubeBot.prototype.blockVideo = function() {
	var type = this.currentMedia["type"]
	var id = this.currentMedia["id"]
	var uid = this.currentUID
	var flags = 2
	var title = this.currentMedia["title"]

	this.db.blockVideo(type, id, flags, title)
	this.deleteVideo(uid)
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
	if (this.playlist.length === 1 && this.stats["managing"])
		this.addRandomVideos()
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
		this.userlist.push(data);
		console.log("Added User: " + data["name"])
		console.log("Userlist has : " + this.userlist.length + " users")
	}
};

// Handles changeMedia frames from the server
// If the bot is managing the playlist and the last video was not
// temporary it sends a delete frame.
// data - changeMedia data
CytubeBot.prototype.handleChangeMedia = function(data) {
	if (this.stats["managing"] && this.doneInit && !this.firstChangeMedia && this.playlist.length !== 0) {
		var temp = true
		var id = this.currentMedia["id"]
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
	var index = utils.handle(this, "findIndexOfVideoFromUID", data["uid"])

	if (typeof index !== undefined) {
		console.log("### Deleting media at index: " + index)
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
	var doSomething = (this.currentMedia["seconds"] - data["currentTime"]) < 10 && this.playlist.length === 1 && this.stats["managing"]
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

	// Try to avoid old commands from playback
	if (time < this.startTime)
		return

	if (msg.indexOf("$") === 0 && username != this.username && this.doneInit) {
		commands.handle(this, username, msg)
		return
	}

	this.db.insertChat(msg, time, username, this.room)
};

// Handles playlist frames from the server and validates the videos
// playlist - playlist data
CytubeBot.prototype.handlePlaylist = function(playlist) {
	var bot = this
	this.playlist = playlist
	if (this.playlist.length === 0 && this.stats["managing"])
		this.addRandomVideos()

	for (var i in playlist) {
		this.validateVideo(playlist[i], function(block, uid) {
			if (block)
				bot.deleteVideo(uid)
		})
	}
};

// Handles needPassword frames from the server
// needPasswords are sent when the room we are trying to join has a password
CytubeBot.prototype.handleNeedPassword = function(data) {
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
		console.log("Userlist has : " + bot.userlist.length + " users")
	}
};

// Handles userlist frames from the server
// userlistData - userlist data
CytubeBot.prototype.handleUserlist = function(userlistData) {
	this.userlist = userlistData;
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
			if (!bot.stats["hybridMods"]) {
				bot.stats["hybridMods"] = {}
				bot.writePersistentSettings()
			}
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
		rank = utils.handle(bot, "getUser", this.username.toLowerCase())["rank"]

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

// Sends a chatMsg with the status of the bot
// ie. is the bot muted and managing
CytubeBot.prototype.sendStatus = function() {
	var status = "[Muted: "
	status += this.stats["muted"]
	status += " Managing playlist: " + this.stats["managing"]
	status += "]"

	this.socket.emit("chatMsg", {
		msg: status,
		meta: {}
	})
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

	try {
		var rank = utils.handle(this, "getUser", nick)["rank"]
	} catch (e) {
		console.log("!~~~! Error looking up user rank for validate video\n" +
			"      Probably from a user not on the list")
		var rank = 0
	}

	if (nick.toLowerCase() !== this.username)
		bot.db.insertVideo(type, id, title, dur, nick)

	this.db.getVideoFlag(type, id, function(row) {
		if (row["flags"] === 2) {
			if (rank < 2) {
				bot.sendChatMsg("*** Video blocked: " + title)
				callback(true, uid)
				return
			}
			return
		}

		if (type === "yt" && bot.youtubeapi) {
			api.APICall(id, "youtubelookup", bot.youtubeapi, function(status, vidInfo) {
				if (status !== true) {
					bot.sendChatMsg("Invaled video: " + id)
					bot.db.blacklistVideo(type, id, 1, title)
					callback(true, uid)
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
					bot.db.blacklistVideo(type, id, 1, title)
					callback(true, uid)
					return
				} else if (shouldDelete) {
					bot.sendChatMsg("Video blocked in: " + bot.deleteIfBlockedIn +
						" id: " + id)
					bot.db.blacklistVideo(type, id, 1, title)
					callback(true, uid)
					return
				}
			})
		}
	})
}

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