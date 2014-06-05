var Utils = {

	// Checks to see if a user is in the userlist
	// Returns true if it is, or false if it isn't
	// bot - Reference to the bot
	// user - User to find
	"userInUserlist": function(bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"] == user)
				return true
		}
		return false
	},

	// Looks for user, returning the user index
	// bot - Reference to the bot
	// user - User to find
	"findUser": function(bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"] == user)
				return u
		}
	},

	// Looks for user, returning the user object
	// bot - Reference to the bot
	// user - User to find
	"getUser": function(bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"].toLowerCase() == user.toLowerCase())
				return bot.userlist[u]
		}
	},

	// Checks if the video is on the playlist
	// Returns true if it is, false if it isn't
	// bot - Reference to the bot
	// video - The video to look for
	"isOnPlaylist": function(bot, video) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]["media"]["id"] == video["item"]["media"]["id"]) {
				return true
			}
		}
	},

	// Finds the video from a UID
	// Returns the object if we find it
	// bot - Reference to the bot
	// uid - UID of the video we are looking for
	"getVideoFromUID": function(bot, uid) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]["uid"] == uid)
				return bot.playlist[i]
		}
	},

	// Finds the index of a video uses a whole video object
	// Compares using the ids
	// Returns the index
	// bot - Reference to the bot
	"findIndexOfVideoFromVideo": function(bot, video) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]["media"]["id"] == video["item"]["media"]["id"]) {
				return i
			}
		}
	},

	// Finds the index of a video using the UID
	// Returns the index
	// bot - Reference to the bot
	// uid - UID of the video we are looking for
	"findIndexOfVideoFromUID": function(bot, uid) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]["uid"] === uid)
				return i
		}
	},

	// Finds all videos added by a user
	// Returns an array of UIDs
	// bot - Reference to the bot
	// name - The name of the user we are finding videos for
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

	// Finds all videos that match title
	// Returns a list of uids
	// bot - Reference to the bot
	// title - The title we are trying to match
	"findVideosFromTitle": function(bot, title) {
		if (!title)
			return []

		title = ".*" + title + ".*"
		var returnUIDs = []
		var reg = new RegExp(title, "ig")
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]["media"]["title"].match(reg)) {
				returnUIDs.push(bot.playlist[i]["uid"])
				console.log("#~~~# We got a hit: " + bot.playlist[i]["media"]["title"])
			}
		}
		return returnUIDs
	},

	// Checks to see if a user has permission to do something
	// Called by commands and handleHybridModPermissionChange
	// Returns an object containing: hasPermission, which will be true/false depending
	// if the user has that permission. And permissions, 
	// which is an array of the permissions matched.
	// bot - Reference to the current bot
	// permissionData - Contains the permissions we are looking for and the name
	// of the user.
	"userHasPermission": function(bot, permissionData) {
		var name = permissionData["name"]
		var permission = permissionData["permission"]
		var returnData = {
			hasPermission: false,
			permissions: []
		}

		if (!bot.stats["hybridMods"])
			return returnData

		if (name in bot.stats["hybridMods"]) {
			// Loop through the permissions for that user, looking for matching ones
			for (var i = 0; i < permission.length; i++) {
				if (bot.stats["hybridMods"][name].match(permission[i])) {
					returnData["permissions"].push(permission[i])
				}
			}
			if (returnData["permissions"].length !== 0) {
				returnData["hasPermission"] = true
				return returnData // If we found matching permissions
			} else {
				if (bot.stats["hybridMods"][name].match("ALL"))
					returnData["hasPermission"] = true
				return returnData // If we didn't, or we found all
			}
		} else {
			return returnData // We didn't find the user
		}
	},

	// Filters an incoming chatMsg
	// or database quote of HTML entities and htmltags
	// bot - Reference to the bot
	// msg - The message to filter
	"filterMsg": function(bot, msg) {
		msg = msg.replace(/&#39;/g, "'")
		msg = msg.replace(/&amp;/g, "&")
		msg = msg.replace(/&lt;/g, "<")
		msg = msg.replace(/&gt;/g, ">")
		msg = msg.replace(/&quot;/g, "\"")
		msg = msg.replace(/&#40;/g, "\(")
		msg = msg.replace(/&#41;/g, "\)")
		msg = msg.replace(/(<([^>]+)>)/ig, "")
		msg = msg.replace(/^[ \t]+/g, "")

		return msg
	},

	// Generic loop for uids
	// bot - Reference to the bot
	// data - Meant to be an object with members:
	// 		kind - The function we want to use. eg sendMoveMedia
	// 		num: The number or "all"
	// 		uids: The uids of the videos
	"genericUIDLoop": function(bot, data) {
		if (!data)
			return

		var kind = data["kind"]
		var num = data["num"]
		var uids = data["uids"]

		if (!bot[kind])
			return console.log("!~~~! genericUIDLoop No such method: " + kind)

		if (!num) {
			// We should use the first uid
			bot[kind](uids[0])
		} else if (num === "all") {
			// We should use all the uids
			for (var i = 0; i < uids.length; i++) {
				bot[kind](uids[i])
			}
		} else {
			// We should use num uids
			for (var i = 0; i < num; i++) {
				if (i > uids.length)
					break
				bot[kind](uids[i])
			}
		}
	},

	"parseBumpData": function(bot, bumpData) {
		if (!bumpData)
			return bot.sendChatMsg("Incorrect format")

		var splitData = bumpData.split(" ")

		var bumpKind = splitData.splice(0, 1)[0]
		var bumpAmount = splitData[splitData.length - 1]
		var num = 0
		var uids = []

		if (bumpAmount) {
			if (bumpAmount.toLowerCase() === "all") {
				num = "all"
				splitData.splice(splitData.length - 1, 1)
			} else if (!isNaN(parseInt(bumpAmount))) {
				num = bumpAmount
				splitData.splice(splitData.length - 1, 1)
			}
		}

		// We don't have enough info to continue
		if (splitData.length === 0 || !splitData[0])
			return bot.sendChatMsg("Incorrect format")

		if (bumpKind === "-user") {
			uids = Utils.findVideosAddedByUser(bot, splitData[0]).reverse()
		} else if (bumpKind === "-title") {
			uids = Utils.findVideosFromTitle(bot, splitData.join(" ")).reverse()
		}

		return {
			kind: "sendMoveMedia",
			num: num,
			uids: uids
		}
	},

	// Parses a link from $add
	// Used to send queue frames via addVideo
	// bot - Reference to the bot
	// url - the URL of the video we are going to parse
	"parseMediaLink": function(bot, url) {
		if (typeof url != "string") {
			return {
				id: null,
				type: null
			}
		}
		url = url.trim()

		// JWPlayer
		if (url.indexOf("jw:") === 0) {
			return {
				id: url.substring(3),
				type: "jw"
			}
		}

		// RTMP server
		if (url.indexOf("rtmp://") === 0) {
			return {
				id: url,
				type: "rt"
			}
		}

		var m
			// YouTube
		if ((m = url.match(/youtube\.com\/watch\?v=([^&#]+)/))) {
			return {
				id: m[1],
				type: "yt"
			}
		}

		// Short YouTube link
		if ((m = url.match(/youtu\.be\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "yt"
			}
		}

		// YouTube playlist
		if ((m = url.match(/youtube\.com\/playlist\?list=([^&#]+)/))) {
			return {
				id: m[1],
				type: "yp"
			}
		}

		// Twitch.tv
		if ((m = url.match(/twitch\.tv\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "tw"
			}
		}

		// Justin.tv
		if ((m = url.match(/justin\.tv\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "jt"
			}
		}

		// livestream.com
		if ((m = url.match(/livestream\.com\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "li"
			}
		}

		// ustream.tv
		if ((m = url.match(/ustream\.tv\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "us"
			}
		}

		// Vimeo.com
		if ((m = url.match(/vimeo\.com\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "vi"
			}
		}

		// dailymotion.com
		if ((m = url.match(/dailymotion\.com\/video\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "dm"
			}
		}

		// imgur.com 
		// Because people actually use this (not)
		if ((m = url.match(/imgur\.com\/a\/([^&#]+)/))) {
			return {
				id: m[1],
				type: "im"
			}
		}

		// soundcloud.com
		if ((m = url.match(/soundcloud\.com\/([^&#]+)/))) {
			return {
				id: url,
				type: "sc"
			}
		}

		// Google drive links
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
	},

	// Used by $userlimit
	// Handles changes to bot.stats.userlimit
	// userlimitData - Object containing the match
	// and a callback function
	"parseUserlimit": function(bot, userlimitData) {
		var match = userlimitData["match"]
		var callback = userlimitData["callback"]
		var isTrue = true
		var isFalse = false
		var num = 0

		// Both params were given
		if (typeof match[1] !== "undefined" && typeof match[2] !== "undefined") {
			isTrue = (match[1] === "true")
			isFalse = (match[1] === "false")

			num = parseInt(match[2])

			if (isTrue) {
				bot.stats["userLimit"] = isTrue
			} else if (isFalse) {
				bot.stats["userLimit"] = !isFalse
			}
			if (!isNaN(num))
				bot.stats["userLimitNum"] = num
		} else if (typeof match[1] !== "undefined" && match[2] === "") {
			// Boolean given
			isTrue = (match[1] === "true")
			isFalse = (match[1] === "false")

			if (isTrue) {
				bot.stats["userLimit"] = isTrue
			} else if (isFalse) {
				bot.stats["userLimit"] = !isFalse
			}
		} else if (typeof match[0] !== "undefined") {
			num = parseInt(match[0])
			if (!isNaN(num))
				bot.stats["userLimitNum"] = num
		}

		return callback()
	}
}

var handlerList = []
for (var key in Utils) {
	handlerList.push({
		re: new RegExp(key),
		fn: Utils[key]
	});
}

// Matches the command with a function
function handle(bot, command, data) {
	for (var i = 0; i < handlerList.length; i++) {
		var h = handlerList[i]
		if (command.match(h.re)) {
			return h.fn(bot, data)
		}
	}
}

exports.handle = handle