var utilHandlers = {

	"userInUserlist": function(bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"] == user)
				return true
		}
		return false
	},

	"findUser": function(bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"] == user)
				return u
		}
	},

	"getUser": function(bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"].toLowerCase() == user.toLowerCase())
				return bot.userlist[u]
		}
	},

	"isOnPlaylist": function(bot, video) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['media']["id"] == video["item"]["media"]["id"]) {
				return true
			}
		}
	},

	"getVideoFromUID": function(bot, uid) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['uid'] == uid)
				return bot.playlist[i]
		}
	},

	"findIndexOfVideoFromVideo": function(bot, video) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['media']["id"] == video["item"]["media"]["id"]) {
				return i
			}
		}
	},

	"findIndexOfVideoFromUID": function(bot, uid) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['uid'] === uid)
				return i
		}
	},

	"findUIDOfVideoFromID": function(bot, id) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['media']["id"] === id)
				return bot.playlist[i]["uid"]
		}
	},

	"findVideosAddedByUser": function(bot, name) {
		if (!name)
			return
		var returnUIDs = []
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]["queueby"].toLowerCase() === name.toLowerCase()) {
				returnUIDs.push(bot.playlist[i]["uid"])
			}
		}
		return returnUIDs
	},

	"userHasPermission": function(bot, permissionData) {
		var name = permissionData["name"]
		var permission = permissionData["permission"]
		if (!bot.stats["hybridMods"])
			return {
				hasPermission: false
			}

		var returnData = {
			hasPermission: false
		}

		if (name in bot.stats["hybridMods"]) {
			for (var i = 0; i < bot.stats["hybridMods"][name].length; i++) {
				if (bot.stats["hybridMods"][name][i] === permission) {
					console.log("user has permission userHasPermission")
					returnData = {
						hasPermission: true,
						index: i,
						hasAll: false
					}
					return returnData
				} else if (bot.stats["hybridMods"][name][i] === "ALL") { // User has all
					returnData = {
						hasPermission: true,
						hasAll: true
					}

					return returnData
				}
			}
			return returnData
		} else { // User is not in list
			console.log("user is not in hybridmod list userHasPermission")
			return returnData
		}
	},

	"parseMediaLink": function(bot, url) {
		if (typeof url != "string") {
			return {
				id: null,
				type: null
			}
		}
		url = url.trim()

		if (url.indexOf("jw:") == 0) {
			return {
				id: url.substring(3),
				type: "jw"
			}
		}

		if (url.indexOf("rtmp://") == 0) {
			return {
				id: url,
				type: "rt"
			}
		}

		var m;
		if ((m = url.match(/youtube\.com\/watch\?v=([^&#]+)/))) {
			return {
				id: m[1],
				type: "yt"
			}
		}

		if ((m = url.match(/youtu\.be\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "yt"
			}
		}

		if ((m = url.match(/youtube\.com\/playlist\?list=([^&#]+)/))) {
			return {
				id: m[1],
				type: "yp"
			}
		}

		if ((m = url.match(/twitch\.tv\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "tw"
			}
		}

		if ((m = url.match(/justin\.tv\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "jt"
			}
		}

		if ((m = url.match(/livestream\.com\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "li"
			}
		}

		if ((m = url.match(/ustream\.tv\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "us"
			}
		}

		if ((m = url.match(/vimeo\.com\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "vi"
			}
		}

		if ((m = url.match(/dailymotion\.com\/video\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "dm"
			}
		}

		if ((m = url.match(/imgur\.com\/a\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "im"
			}
		}

		if ((m = url.match(/soundcloud\.com\/([^&#]+)/))) {
			return {
				id: url,
				type: "sc"
			}
		}

		if ((m = url.match(/docs\.google\.com\/file\/d\/([^\/]*)/))) {
			return {
				id: m[1],
				type: "gd"
			}
		}

		return {
			id: null,
			type: null
		}
	}
}

var handlerList = []
for (var key in utilHandlers) {
	handlerList.push({
		re: new RegExp(key),
		fn: utilHandlers[key]
	});
}

function handle(bot, command, data) {
	for (var i = 0; i < handlerList.length; i++) {
		var h = handlerList[i];
		if (command.match(h.re)) {
			return h.fn(bot, data);
		}
	}
}

exports.handle = handle