var io = require("socket.io-client")
var commands = require("./chatcommands")
var utils = require("./utils")
var Database = require("./database")
var api = require("./apiclient")
var fs = require("fs")

module.exports = {
	init: function(cfg) {
		console.log("Starting bot");
		var bot = new CytubeBot(cfg);
		return bot
	}
}

	function CytubeBot(config) {
		var bot = this
		this.socket = io.connect(config["serverio"])
		this.username = config["username"]
		this.pw = config["pw"]
		this.room = config["room"]
		this.roomPassword = config["roompassword"]
		this.userlist = {};
		this.playlist = [];
		this.currentMedia = {};
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


		this.db = Database.init();
	};

CytubeBot.prototype.addRandomVideos = function(num) {
	var bot = this
	if (this.db)
		this.db.getVideos(num, function(rows) {
			for (var i in rows) {
				var type = rows[i]["type"]
				var id = rows[i]["id"]
				var duration = rows[i]["duration_ms"] / 1000
				bot.addVideo(type, id, duration)
			}
		})
};

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

CytubeBot.prototype.blacklistVideo = function() {
	var type = this.currentMedia["type"]
	var id = this.currentMedia["id"]
	var flags = 1
	var title = this.currentMedia["title"]

	this.db.blacklistVideo(type, id, flags, title)
};

CytubeBot.prototype.blockVideo = function() {
	var type = this.currentMedia["type"]
	var id = this.currentMedia["id"]
	var uid = utils.handle(this, "findUIDOfVideoFromID", id)
	var flags = 2
	var title = this.currentMedia["title"]

	this.db.blockVideo(type, id, flags, title)
	this.deleteVideo(uid)
};

CytubeBot.prototype.deleteVideo = function(uid) {
	console.log("!~~~! Sending delete frame for uid: " + uid)
	this.socket.emit("delete", uid)
	if (this.playlist.length === 0 && this.stats["managing"])
		this.addRandomVideos()

};

CytubeBot.prototype.deleteVideosFromDatabase = function(like) {
	var bot = this
	this.db.deleteVideos(like, function(num) {
		bot.sendChatMsg("Deleted: " + num + " videos")
	})
};

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

CytubeBot.prototype.handleAddMedia = function(data) {
	var bot = this
	if (utils.handle(this, "isOnPlaylist", data)) {
		console.log("### Video is on playlist")
		console.log("### video is at: " + utils.handle(this, "findIndexOfVideoFromVideo", data))
		return
	} else if (this.playlist.length === 0) {
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

CytubeBot.prototype.handleAddUser = function(data) {
	var inList = utils.handle(this, "userInUserlist", data["name"])
	this.db.insertUser(data["name"])
	if (!inList) {
		this.userlist.push(data);
		console.log("Added User: " + data["name"])
		console.log("Userlist has : " + this.userlist.length + " users")
	}
};

CytubeBot.prototype.handleChangeMedia = function(data) {
	if (this.stats["managing"] && this.doneInit && !this.firstChangeMedia && this.playlist.length !== 0) {
		var temp = false
		var id = this.currentMedia["id"]
		var uid = utils.handle(this, "findUIDOfVideoFromID", id)
		// If typeof uid is undefined, the server probably sent a
		// delete frame before the changeMedia frame
		// So our playlist doesn't contain the current media anymore 
		if (uid)
			temp = utils.handle(this, "getVideoFromUID", uid)["temp"]
		if (uid && !temp)
			this.deleteVideo(uid)
	}
	this.currentMedia = data
	this.firstChangeMedia = false
	console.log("### Current Video now " + this.currentMedia["title"])
};

CytubeBot.prototype.handleDeleteMedia = function(data) {
	var index = utils.handle(this, "findIndexOfVideoFromUID", data["uid"])

	console.log("### Deleting media at index: " + index)
	if (typeof index !== undefined) {
		this.playlist.splice(index, 1)
		if (this.playlist.length === 0 && this.stats["managing"])
			bot.addRandomVideos()
	}
};

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
	}

	if (this.stats["hybridMods"][name] === "")
		delete this.stats["hybridMods"][name]

	this.sendHybridModPermissions(name)
	this.writePersistentSettings()
};

CytubeBot.prototype.handleMediaUpdate = function(data) {
	console.log("### Current video time: " + data["currentTime"] + " Paused: " + data["paused"])
	var doSomething = (this.currentMedia["seconds"] - data["currentTime"]) < 10 && this.playlist.length === 1 && this.stats["managing"]
	if (doSomething) {
		console.log("Shit son, we gotta do something, the video is ending")
		this.addRandomVideos()
	}
};

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

CytubeBot.prototype.handleChatMsg = function(data) {
	var username = data.username
	var msg = data.msg
	var time = data.time

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

CytubeBot.prototype.handleSetTemp = function(data) {
	var temp = data["temp"]
	var uid = data["uid"]

	var index = utils.handle(this, "findIndexOfVideoFromUID", uid)
	console.log("### Setting temp: " + temp + " on video at index " + index)
	this.playlist[index]["temp"] = temp
};

CytubeBot.prototype.handleSetUserRank = function(data) {
	for (var i = 0; i < this.userlist.length; i++) {
		if (this.userlist[i]["name"].toLowerCase() === data["name"].toLowerCase()) {
			this.userlist[i]["rank"] = data["rank"]
			console.log("Setting rank: " + data["rank"] + " on " + data["name"])
			break
		}
	}
};

CytubeBot.prototype.handleUserLeave = function(user) {
	var index = utils.handle(this, "findUser", user)
	if (index) {
		this.userlist.splice(index, 1)
		console.log("Removed user: " + user)
		console.log("Userlist has : " + bot.userlist.length + " users")
	}
};

CytubeBot.prototype.handleUserlist = function(userlistData) {
	this.userlist = userlistData;
};

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

CytubeBot.prototype.sendChatMsg = function(message) {
	var rank = 0
	if (this.doneInit)
		rank = utils.handle(bot, "getUser", this.username.toLowerCase())["rank"]

	if (!this.stats["muted"]) {
		console.log("!~~~! Sending chatMsg: " + message)
		if (!this.flair)
			this.socket.emit("chatMsg", {
				msg: message
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

CytubeBot.prototype.sendHybridModPermissions = function(name) {
	if (name)
		this.sendChatMsg(name + ": " + this.stats["hybridMods"][name])
};

CytubeBot.prototype.sendStatus = function() {
	var status = "[Muted: "
	status += this.stats["muted"]
	status += " Managing playlist: " + this.stats["managing"]
	status += "]"

	this.socket.emit("chatMsg", {
		msg: status
	})
};

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