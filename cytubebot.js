var io = require("socket.io-client")
var commands = require("./chatcommands")
var utils = require("./utils")
var Database = require("./database")

module.exports = {
	init: function(cfg) {
		console.log("Starting bot");
		var bot = new CytubeBot(cfg);
		return bot
	}
}

	function CytubeBot(config) {
		this.socket = io.connect(config["server"]);
		this.username = config["username"];
		this.pw = config["pw"];
		this.room = config["room"];
		this.userlist = {};
		this.playlist = [];
		this.currentMedia = {};
		this.wolfram = config["wolfram"]
		this.weatherunderground = config["weatherunderground"]
		this.timeSinceLastWeather = 0
		this.muted = false;

		this.db = Database.init();
	};

CytubeBot.prototype.addRandomVideos = function(num, username) {
	var bot = this
	this.db.getVideos(num, function(rows) {
		for (var i in rows) {
			var type = rows[i]["type"]
			var id = rows[i]["id"]
			var duration = rows[i]["duration_ms"] / 1000
			bot.addVideo(type, id, duration)
		}
	})
};

CytubeBot.prototype.addVideo = function(type, id, duration, temp, link) {
	if (!temp) {
		temp = false
	}
	if (!link) {
		var json = {
			"id": id,
			"type": type,
			"pos": "end",
			"duration": 0,
			"temp": temp
		}
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
	var uid = utils.handle(this, "findIndexOfVideoFromID", id)
	var flags = 2
	var title = this.currentMedia["title"]

	this.db.blockVideo(type, id, flags, title)
	this.deleteVideo(uid)
};

CytubeBot.prototype.deleteVideo = function(uid) {
	this.socket.emit("delete", uid)
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
	} else if (!this.playlist) {
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

CytubeBot.prototype.handleChangeMedia = function(data) {
	this.currentMedia = data
	console.log("### Current Video now " + this.currentMedia["title"])
};

CytubeBot.prototype.handleDeleteMedia = function(data) {
	var index = utils.handle(this, "findIndexOfVideoFromUID", data["uid"])

	console.log("### Deleting media at index: " + index)
	if (typeof index !== undefined)
		this.playlist.splice(index, 1)
};

CytubeBot.prototype.handleMediaUpdate = function(data) {
	console.log("Current video time: " + data["currentTime"] + " Paused: " + data["paused"])

	if ((this.currentMedia["seconds"] - data["currentTime"]) < 10 && this.playlist.length == 1) {
		console.log("Shit son, we gotta do something, the video is ending\nAdding a video")
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

CytubeBot.prototype.handleAddUser = function(data) {
	var inList = utils.handle(this, "userInUserlist", data["name"])
	console.log(inList)
	this.db.insertUser(data["name"])
	if (!inList) {
		this.userlist.push(data);
		console.log("Added User: " + data["name"])
		console.log("Userlist has : " + bot.userlist.length + " users")
	}
};

CytubeBot.prototype.handleChatMsg = function(data) {
	var username = data.username;
	var msg = data.msg;
	var time = data.time;
	var timeNow = new Date().getTime();

	msg = msg.replace(/&#39;/, "'")
	msg = msg.replace(/&amp;/, "&")
	msg = msg.replace(/&lt;/, "<")
	msg = msg.replace(/&gt;/, ">")
	msg = msg.replace(/&quot;/, "\"")
	msg = msg.replace(/&#40;/, "\(")
	msg = msg.replace(/&#41;/, "\)")
	msg = msg.replace(/(<([^>]+)>)/ig, "")
	msg = msg.replace(/^[ \t]+/, "")
	if (!msg)
		return
	console.log("Chat Message: " + username + ": " + msg)

	// Try to avoid old commands from playback
	if (time + 5000 < timeNow)
		return

	if (msg.indexOf("$") === 0 && username != this.username) {
		commands.handle(this, username, msg);
		return
	}

	this.db.insertChat(msg, time, username, this.room)
};

CytubeBot.prototype.handlePlaylist = function(playlist) {
	var bot = this
	this.playlist = playlist
	for (var i in playlist) {
		this.validateVideo(playlist[i], function(block, uid) {
			if (block) {
				bot.deleteVideo(uid)
			}
		})
	}
};

CytubeBot.prototype.handleUserLeave = function(user) {
	var index = utils.handle(this, "findUser", user)
	if (index) {
		this.userlist.splice(index, 1);
		console.log("Removed user: " + user)
		console.log("Userlist has : " + bot.userlist.length + " users")
	}
};

CytubeBot.prototype.handleUserlist = function(userlistData) {
	this.userlist = userlistData;
};

CytubeBot.prototype.sendChatMsg = function(message) {
	if (!this.muted)
		this.socket.emit("chatMsg", {
			msg: message
		});
};

CytubeBot.prototype.sendStatus = function() {
	var status = "Muted: "
	status += this.muted

	this.socket.emit("chatMsg", {
		msg: status
	})
};

CytubeBot.prototype.start = function() {
	this.socket.emit("initChannelCallbacks");
	this.socket.emit("joinChannel", {
		name: this.room
	});
	this.socket.emit("login", {
		name: this.username,
		pw: this.pw
	})
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

	this.db.getVideoFlag(type, id, function(row) {
		if (row["flags"] === 2) {
			if (rank < 2) {
				bot.sendChatMsg("*** Video blocked: " + title)
				callback(true, uid)
				return
			}
			return
		}
	})

	if (nick !== this.username)
		bot.db.insertVideo(type, id, title, dur, nick)
};