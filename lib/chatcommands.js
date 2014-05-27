var api = require("./apiclient")
var utils = require("./utils")
var custom = require("./custom")

var chatHandlers = {

	// See readme for chat commands

	"add": function(bot, username, data, fromIRC) {
		if (fromIRC || !data)
			return

		var hasPermission = bot.checkPermission(username, "A")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: add")
		}

		if (rank >= 2 || hasPermission) {
			var vidInfo = utils.handle(bot, "parseMediaLink", data)
			if (vidInfo["type"] === "yt" && bot.youtubeapi) {
				bot.validateYoutubeVideo(vidInfo["id"], vidInfo["type"], null, function(unplayable) {
					if (unplayable) {
						return
					} else {
						bot.addVideo(null, null, null, null, vidInfo)
					}
				})
			} else {
				bot.addVideo(null, null, null, null, vidInfo)
			}

		}
	},

	"addrandom": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, "R")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: addrandom")
		}

		if (data <= 20 && rank >= 2 || hasPermission && data <= 20)
			bot.addRandomVideos(data)
	},

	"anagram": function(bot, username, msg) {
		if ((new Date().getTime() - bot.timeSinceLastAnagram) / 1000 < 5) {
			console.log("!~~~! Anagram cooldown")
			return
		}
		bot.timeSinceLastAnagram = new Date().getTime()
		if (msg.length < 7) {
			bot.sendChatMsg("Message too short")
			return
		} else if (msg.length > 30) {
			bot.sendChatMsg("Message too long")
			return
		}

		api.APICall(msg, "anagram", null, function(resp) {
			try {
				bot.sendChatMsg("[" + msg + "] -> " + resp[1])
			} catch (e) {
				bot.sendChatMsg("There was a problem with the request");
			}
		})
	},

	"ask": function(bot, username, msg) {
		var answers = ["Yes", "No"]
		var answer = answers[Math.floor(Math.random() * 2)]
		bot.sendChatMsg("[Ask: " + msg + "] " + answer)
	},

	"autodelete": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: autodelete")
		}

		if (rank < 4)
			return

		bot.blockVideo()
	},

	"blacklist": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: blacklist")
		}

		if (rank < 3)
			return

		bot.blacklistVideo()
	},

	"blockuser": function(bot, username, data, fromIRC) {
		if (fromIRC || !data)
			return

		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (err) {
			console.log("!~~~!: Error looking up rank: blockuser")
		}

		if (rank < 4)
			return

		var match = data.match(/(\w*) (true|false)/)

		if (!match)
			return

		var user = match[1]
		var flag = match[2]

		if (flag === "true") {
			flag = true
		} else {
			flag = false
		}

		bot.blockUser(user, flag)
	},

	"bump": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: bump")
		}

		var hasPermission = bot.checkPermission(username, "B")

		if (rank < 2 && !hasPermission)
			return

		var splitData = data.split(" ")

		if (splitData) {
			var bumpKind = splitData.splice(0, 1)[0]
			var bumpAmount = splitData[splitData.length - 1]
			var num = 0
			if (bumpAmount) {
				if (bumpAmount.toLowerCase() === "all") {
					num = "all"
					splitData.splice(splitData.length - 1, 1)
				} else if (!isNaN(parseInt(bumpAmount))) {
					num = bumpAmount
					splitData.splice(splitData.length - 1, 1)
				}
			}

			var uids = []
			if (bumpKind === "-user") {
				uids = utils.handle(bot, "findVideosAddedByUser", splitData[0]).reverse()
				if (!num) {
					bot.sendMoveMedia(uids[0]) // We should move the last match
				} else if (num === "all") { // We should move all the videos matched
					for (var i = 0; i < uids.length; i++) {
						bot.sendMoveMedia(uids[i])
					}
				} else {
					for (var i = 0; i < num; i++) { // We should move num videos matched
						if (i > uids.length)
							break
						bot.sendMoveMedia(uids[i])
					}
				}
			} else if (bumpKind === "-title") {
				uids = utils.handle(bot, "findVideosFromTitle", splitData.join(" ")).reverse()
				if (!num) {
					bot.sendMoveMedia(uids[0]) // We should move the last match
				} else if (num === "all") { // We should move all the videos matched
					for (var i = 0; i < uids.length; i++) {
						bot.sendMoveMedia(uids[i])
					}
				} else {
					for (var i = 0; i < num; i++) { // We should move num videos matched
						if (i > uids.length)
							break
						bot.sendMoveMedia(uids[i])
					}
				}
			}
		}
	},

	"checkplaylist": function(bot, username, data) {
		bot.checkPlaylist()
	},

	"choose": function(bot, username, data) {
		if (!data)
			return

		var choices = data.trim().split(" ")
		var choice = choices[Math.floor(Math.random() * choices.length)]
		bot.sendChatMsg("[Choose: " + choices.join(" ") + "] " + choice)
	},

	// Unlisted command
	"debuguserlist": function(bot, username, data) {
		if (data) {
			var user = utils.handle(bot, "getUser", data.trim())
			console.log(user)
			return
		}

		for (var i = 0; i < bot.userlist.length; i++) {
			console.log(bot.userlist[i])
		}
	},

	"delete": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		data = data.split(" ")

		var hasPermission = bot.checkPermission(username, "D")
		var name
		var num

		// If delete is called with a number or no args,
		// we assume the caller wants to delete their own videos
		if (!data || data.length === 1) {
			if (data[0] && !isNaN(parseInt(data[0])) || data[0] && data[0] === "all") {
				name = username
				num = data[0]
			} else if (data[0] && isNaN(parseInt(data[0]))) {
				name = data[0]
			} else {
				name = username
			}
		} else {
			name = data[0]
			num = data[data.length - 1]
		}
		var uids = utils.handle(bot, "findVideosAddedByUser", name)
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: delete")
		}

		if (!num) {
			num = 1
		} else if (num.toLowerCase() === "all") {
			num = uids.length
		}

		if (username.toLowerCase() === name.toLowerCase()) {
			uids.reverse()
			for (var i = 0; i < num; i++) {
				bot.deleteVideo(uids[i])
			}
		} else if (rank >= 2 || hasPermission) {
			uids.reverse()
			for (var i = 0; i < num; i++) {
				bot.deleteVideo(uids[i])
			}
		}
	},

	"deletevideos": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: deletevideos")
		}

		if (rank < 5)
			return

		bot.deleteVideosFromDatabase(data)
	},

	"dubs": function(bot, username) {
		var num = Math.floor((Math.random() * 100000000) + 1)
		bot.sendChatMsg(username + ": " + num)
	},

	"forecast": function(bot, username, data) {
		if (bot.muted || !bot.weatherunderground)
			return

		if ((new Date().getTime() - bot.timeSinceLastWeather) / 1000 < 10) {
			bot.sendChatMsg("Weather Cooldown")
			return
		}

		var tomorrow = data.match("tomorrow")
		if (tomorrow) {
			data = data.replace(/tomorrow/ig, "")
		}

		var postForecast = function(forecast) {
			api.APICall(data, "weather", bot.weatherunderground, function(resp) {
				var parsedJSON = JSON.parse(resp)
				if (parsedJSON["response"]["error"]) {
					bot.sendChatMsg("Error")
					return
				}

				var location = parsedJSON["current_observation"]["display_location"]["full"]

				if (tomorrow) {
					if ((location.split(", ")[1]).length != 2) {
						bot.sendChatMsg("Location: " +
							location + " Tomorrow: " +
							forecast["tomorrowDay"]["fcttext_metric"])

						bot.sendChatMsg("Tomorrow Night: " +
							forecast["tomorrowNight"]["fcttext_metric"])
						return
					} else {
						bot.sendChatMsg("Location: " +
							location + " Tomorrow: " +
							forecast["tomorrowDay"]["fcttext"])

						bot.sendChatMsg("Tomorrow Night: " +
							forecast["tomorrowNight"]["fcttext"])
					}
				} else {
					if ((location.split(", ")[1]).length != 2) {
						bot.sendChatMsg("Location: " +
							location + " Today: " +
							forecast["todayDay"]["fcttext_metric"])

						bot.sendChatMsg("Tonight: " +
							forecast["todayNight"]["fcttext_metric"])
						return
					} else {
						bot.sendChatMsg("Location: " +
							location + " Today: " +
							forecast["todayDay"]["fcttext"])

						bot.sendChatMsg("Tonight: " +
							forecast["todayNight"]["fcttext"])
					}
				}

			})
			bot.timeSinceLastWeather = new Date().getTime()
		}

		api.APICall(data, "forecast", bot.weatherunderground, function(resp) {
			var parsedJSON = JSON.parse(resp)
			if (parsedJSON["response"]["error"] || parsedJSON["response"]["results"]) {
				bot.sendChatMsg("Error")
				return
			}

			var forecast = {
				"todayDay": parsedJSON["forecast"]["txt_forecast"]["forecastday"][0],
				"todayNight": parsedJSON["forecast"]["txt_forecast"]["forecastday"][1],
				"tomorrowDay": parsedJSON["forecast"]["txt_forecast"]["forecastday"][2],
				"tomorrowNight": parsedJSON["forecast"]["txt_forecast"]["forecastday"][3]
			}

			// Send forecast data to function to get location
			postForecast(forecast)
		})
	},

	"kill": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, "K")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error")
		}

		if (rank < 2 && !hasPermission)
			return

		// Someone wants this to die
		if (data) {
			bot.sendChatMsg("[kill] " + data)
			setTimeout(function() {
				process.exit(0)
			}, 500)
		} else {
			process.exit(0)
		}

	},

	"management": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: management")
		}

		var hasPermission = bot.checkPermission(username, "G")
		if (rank >= 2 && data.indexOf("on") === 0 || hasPermission && data.indexOf("on")) {
			console.log("!~~~! Bot is now managing the playlist")
			bot.stats["managing"] = true
			bot.writePersistentSettings()
		} else if (rank >= 2 && data.indexOf("off") === 0 || hasPermission && data.indexOf("off")) {
			console.log("!~~~! The bot is no longer managing the playlist")
			bot.stats["managing"] = false
			bot.writePersistentSettings()
		}

		if (bot.playlist.length === 0 && bot.stats["managing"])
			bot.addRandomVideos()
	},

	"mute": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, "M")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: mute")
		}

		if ((rank >= 2 && !bot.stats["muted"]) || hasPermission && !bot.stats["muted"]) {
			bot.stats["muted"] = !bot.stats["muted"]
			console.log(username + " muted bot")
			bot.writePersistentSettings()
		}
	},

	"unmute": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return
		var hasPermission = bot.checkPermission(username, "M")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: unmute")
		}

		if (rank >= 2 && bot.stats["muted"] || hasPermission && bot.stats["muted"]) {
			bot.stats["muted"] = !bot.stats["muted"]
			console.log(username + " unmuted bot")
			bot.writePersistentSettings()
		}
	},

	"permissions": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: permissions")
		}

		var match = data.trim().match(/^((\+|\-)((ALL)|(.*)) )?(.*)$/)
		var permission = match[1]
		var name = match[6].toLowerCase()

		if (permission && rank < 3) {
			return
		} else if (permission) {
			permission = permission.toUpperCase()
		}

		bot.handleHybridModPermissionChange(permission, name)
	},

	"playlistdebug": function(bot, username, data) {
		if (data) {
			console.log(bot.playlist[data])
			return
		}
		console.log(bot.playlist);
	},

	"poll": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		var hasPermission = bot.checkPermission(username, "P")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: poll")
		}


		if (rank < 2 && !hasPermission)
			return

		var hidden = false
		var splitData = data.split(".")
		if (splitData[splitData.length - 1].toLowerCase().match("true")) {
			hidden = true
			splitData.splice(splitData.length - 1, 1)
		}

		var title = splitData[0]
		splitData.splice(0, 1)

		var pollData = {
			title: title,
			opts: splitData,
			obscured: hidden
		}

		bot.createPoll(pollData)

	},

	"endpoll": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, "P")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: endpoll")
		}

		if (rank < 2 && !hasPermission)
			return

		bot.endPoll()
	},

	"processinfo": function(bot) {
		var info = process.memoryUsage()
		bot.sendChatMsg("Heap total: " + info["heapTotal"] + " Heap used: " + info["heapUsed"])
	},

	"quote": function(bot, username, nick) {
		bot.getQuote(nick)
	},

	"shuffle": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, "U")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: shuffle")
		}

		if (rank < 2 && !hasPermission)
			return

		bot.shufflePlaylist()

	},

	"skip": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, "S")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: skip")
		}

		if (rank < 2 && !hasPermission)
			return

		var id = bot.currentMedia["id"]
		var uid = bot.currentUID

		bot.deleteVideo(uid)
	},

	// https://www.youtube.com/watch?v=O1adNgZl_3Q
	"squee": function(bot, username, data) {
		var squeeString = ""
		if (((new Date().getTime() - bot.timeSinceLastSquee) / 1000 < 120) || !bot.doneInit || bot.stats["muted"])
			return

		for (var i in bot.userlist) {
			if (bot.userlist[i]["name"].toLowerCase() !== bot.username.toLowerCase())
				squeeString += bot.userlist[i]["name"] + " "
		}
		bot.sendChatMsg(squeeString.substring(0, squeeString.length - 1))
		bot.timeSinceLastSquee = new Date().getTime()
	},

	"status": function(bot, username, data) {
		bot.sendStatus()
	},

	"talk": function(bot, username, msg) {
		if ((new Date().getTime() - bot.timeSinceLastTalk) / 1000 < 5) {
			console.log("!~~~! Talk cooldown")
			return
		}
		bot.timeSinceLastTalk = new Date().getTime()
		bot.talk(msg, function(resp) {
			bot.sendChatMsg(resp["message"])
		})
	},

	"translate": function(bot, username, data) {
		if (data && bot.mstranslateclient && bot.mstranslatesecret) {
			if ((new Date().getTime() - bot.timeSinceLastTranslate) / 1000 < 5) {
				console.log("!~~~! Translate cooldown")
				return
			}
			bot.timeSinceLastTranslate = new Date().getTime()
			var groups = data.match(/^(\[(([A-z]{2})|([A-z]{2}) ?-?> ?([A-z]{2}))\] ?)?(.+)$/)

			var from = groups[4]
			var to = groups[5]
			var text = groups[6]
			if (!from) {
				from = null
				to = "en"
			}
			var query = {
				from: from,
				to: to,
				text: text
			}
			var apikeys = {
				clientid: bot.mstranslateclient,
				secret: bot.mstranslatesecret
			}
			api.APICall(query, "translate", apikeys, function(data) {
				if (!from) {
					bot.sendChatMsg("[" + to + "] " + data)
					return
				}
				bot.sendChatMsg("[" + from + "->" + to + "] " + data)
			})
		}
	}, // End translate

	"userlimit": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		var hasPermission = bot.checkPermission(username, "L")
		var rank = 0
		try {
			rank = utils.handle(bot, "getUser", username)["rank"]
		} catch (error) {
			console.log("!~~~!: Error looking up rank: userlimit")
		}

		if (rank < 3 && !hasPermission)
			return

		var match = data.match(/^(true|false) ?(\d*)|(\d*)/)

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
		} else if (typeof match[1] !== "undefined" && match[2] === "") { // Boolean given
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

		bot.checkPlaylist()
		bot.writePersistentSettings()
	},

	"weather": function(bot, username, data) {
		if (!bot.weatherunderground) {
			console.log("!~~~! No weatherunderground API key!")
			return
		}

		if (!data || bot.muted)
			return

		if ((new Date().getTime() - bot.timeSinceLastWeather) / 1000 < 10) {
			bot.sendChatMsg("Weather Cooldown")
			return
		}
		api.APICall(data, "weather", bot.weatherunderground, function(resp) {
			var parsedJSON = JSON.parse(resp)
			if (parsedJSON["response"]["error"] || parsedJSON["response"]["results"]) {
				bot.sendChatMsg("Error")
				return
			}
			var location = parsedJSON["current_observation"]["display_location"]["full"]
			var temp_f = parsedJSON["current_observation"]["temp_f"]
			var temp_c = parsedJSON["current_observation"]["temp_c"]
			var date = parsedJSON["current_observation"]["observation_time"]
			var weather = parsedJSON["current_observation"]["weather"]

			bot.sendChatMsg("Currently " +
				weather + " and " +
				temp_f + "F " + "(" +
				temp_c + "C) in " +
				location + ". " + date)
		})
		bot.timeSinceLastWeather = new Date().getTime()
	},

	"wolfram": function(bot, username, query) {
		if (!bot.wolfram) {
			console.log("### No wolfram API key!")
			return
		}
		api.APICall(query, "wolfram", bot.wolfram, function(results) {
			if (typeof results[0] !== "undefined")
				bot.sendChatMsg("[" + query + "] " + results[1]["subpods"][0]["text"])
			else
				bot.sendChatMsg("WolframAlpha query failed")
		})
	}
}

var handlerList = [];
for (var key in chatHandlers) {
	handlerList.push({
		re: new RegExp("^\\$" + key + "(?:\\s|$)"),
		fn: chatHandlers[key]
	});
}

function handle(bot, username, msg, fromIRC) {
	for (var i = 0; i < handlerList.length; i++) {
		var h = handlerList[i]
		if (msg.toLowerCase().match(h.re)) {
			var rest
			if (msg.indexOf(" ") >= 0) {
				rest = msg.substring(msg.indexOf(" ") + 1);
			} else {
				rest = "";
			}
			return h.fn(bot, username, rest, fromIRC);
		}
	}

	// Goto custom commands if we can't find one here
	return custom.handle(bot, username, msg, fromIRC)
}

exports.handle = handle;