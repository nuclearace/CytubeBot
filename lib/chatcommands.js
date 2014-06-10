var api = require("./apiclient")
var utils = require("./utils")
var custom = require("./custom")
var validator = require("./validate")
var exec = require("child_process").exec

var chatHandlers = {

	// See readme for chat commands

	"add": function(bot, username, data, fromIRC) {
		if (fromIRC || !data)
			return

		var hasPermission = bot.checkPermission(username, 2, "A")

		if (!hasPermission)
			return

		var vidList = []

		var addFun = function(vid) {
			if (vid["type"] === "yt" && bot.youtubeapi) {
				validator.validate(bot, vid["id"], vid["type"], null, function(unplayable) {
					if (unplayable) {
						return
					} else {
						bot.addVideo(null, null, null, null, vid)
					}
				})
			} else {
				bot.addVideo(null, null, null, null, vid)
			}
		}

		if (data.split(",").length > 1) {
			vidList = data.split(",")
			for (var i = 0; i < vidList.length; i++) {
				addFun(utils.handle(bot, "parseMediaLink", vidList[i]))
			}
		} else {
			addFun(utils.handle(bot, "parseMediaLink", data))
		}
	},

	"addrandom": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 2, "R")

		if (hasPermission && data <= 20)
			bot.addRandomVideos(data)
	},

	"anagram": function(bot, username, msg) {
		if ((new Date().getTime() - bot.timeSinceLastAnagram) / 1000 < 5)
			return bot.sendChatMsg("Anagram cooldown")

		bot.timeSinceLastAnagram = new Date().getTime()
		if (msg.length < 7) {
			return bot.sendChatMsg("Message too short")
		} else if (msg.length > 30) {
			return bot.sendChatMsg("Message too long")
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

		var hasPermission = bot.checkPermission(username, 4)

		if (!hasPermission)
			return

		bot.blockVideo()
	},

	"blacklist": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 3)

		if (!hasPermission)
			return

		bot.blacklistVideo()
	},

	"blockedusers": function(bot) {
		bot.listBlockedUsers()
	},

	"blockuser": function(bot, username, data, fromIRC) {
		if (fromIRC || !data)
			return

		var hasPermission = bot.checkPermission(username, 4)

		if (!hasPermission)
			return

		var match = data.match(/(\w*) (true|false)/)

		if (!match)
			return

		var user = match[1]
		var flag = match[2]

		if (user === bot.username)
			return

		if (flag === "true") {
			flag = true
		} else {
			flag = false
		}

		bot.blockUser(user, flag)
	},

	"bump": function(bot, username, data, fromIRC) {
		if (fromIRC || !data)
			return

		var hasPermission = bot.checkPermission(username, 2, "B")

		if (!hasPermission)
			return

		var bumpData = utils.handle(bot, "parseBumpData", data)

		if (!bumpData)
			return

		utils.handle(bot, "genericUIDLoop", bumpData)
	},

	"checkplaylist": function(bot) {
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
			return console.log(user)
		}
		console.log(bot.userlist)
	},

	"delete": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		data = {
			userData: data,
			username: username
		}

		var hasPermission = bot.checkPermission(username, 2, "D")
		var deleteData = utils.handle(bot, "parseDeleteData", data)

		if (username.toLowerCase() === deleteData["name"].toLowerCase()) {
			utils.handle(bot, "genericUIDLoop", deleteData)
		} else if (hasPermission) {
			utils.handle(bot, "genericUIDLoop", deleteData)
		}
	},

	"deletevideos": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 5)

		if (!hasPermission)
			return

		bot.deleteVideosFromDatabase(data)
	},

	"forecast": function(bot, username, data) {
		if (bot.muted || !bot.weatherunderground || !data)
			return

		var now = Date.now()
		var waitTime =
			((bot.weatherLimiter.curIntervalStart + bot.weatherLimiter.tokenBucket.interval) - now) / 1000

		if (bot.weatherLimiter.getTokensRemaining() < 1) {
			bot.sendChatMsg("Too many requests sent. Available in: " + waitTime + " seconds")
			return
		}

		var tomorrow = data.match("tomorrow")
		if (tomorrow)
			data = data.replace(/tomorrow/ig, "")

		var postAPI = function(resp) {
			var parsedJSON = JSON.parse(resp)
			if (parsedJSON["response"]["error"] || parsedJSON["response"]["results"])
				return bot.sendChatMsg("Error")

			var forecastData = {
				json: parsedJSON,
				tomorrow: tomorrow
			}

			var forecastStrings = utils.handle(bot, "parseForecastData", forecastData)

			// Send the forecast
			forecastStrings.forEach(function(string) {
				bot.sendChatMsg(string)
			})
		}

		bot.weatherLimiter.removeTokens(1, function() {
			api.APICall(data, "forecast", bot.weatherunderground, postAPI)
		})
	},

	"help": function(bot) {
		bot.sendChatMsg("https://github.com/nuclearace/CytubeBot/blob/master/README.md#commands")
	},

	"management": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 2, "G")
		if (hasPermission && data.indexOf("on") !== -1) {
			console.log("!~~~! Bot is now managing the playlist")
			bot.stats["managing"] = true
			bot.writePersistentSettings()
		} else if (hasPermission && data.indexOf("off") !== -1) {
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

		var hasPermission = bot.checkPermission(username, 2, "M")

		if (hasPermission && !bot.stats["muted"]) {
			bot.stats["muted"] = !bot.stats["muted"]
			console.log(username + " muted bot")
			bot.writePersistentSettings()
		}
	},

	"unmute": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 2, "M")

		if (hasPermission && bot.stats["muted"]) {
			bot.stats["muted"] = !bot.stats["muted"]
			console.log(username + " unmuted bot")
			bot.writePersistentSettings()
		}
	},

	"permissions": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 3)

		var match = data.trim().match(/^((\+|\-)((ALL)|(.*)) )?(.*)$/)
		var permission = match[1]
		var name = match[6].toLowerCase()

		if (!hasPermission) {
			return
		} else if (permission) {
			permission = permission.toUpperCase()
		}

		bot.handleHybridModPermissionChange(permission, name)
	},

	// Unlisted command
	"playlistdebug": function(bot, username, data) {
		if (data)
			return console.log(bot.playlist[data])

		console.log(bot.playlist);
	},

	"poll": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 2, "P")

		if (!hasPermission)
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

		var hasPermission = bot.checkPermission(username, 2, "P")

		if (!hasPermission)
			return

		bot.endPoll()
	},

	"processinfo": function(bot) {
		var info = process.memoryUsage()
		bot.sendChatMsg("Heap total: " + info["heapTotal"] + " Heap used: " + info["heapUsed"])
	},

	"purge": function(bot, username, data, fromIRC) {
		if (!data)
			data = username

		data = data.trim() + " all"
		chatHandlers.delete(bot, username, data, fromIRC)
	},

	"quote": function(bot, username, nick) {
		bot.getQuote(nick)
	},

	"restart": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 2, "K")

		if (!hasPermission)
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

	"shuffle": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 2, "U")

		if (!hasPermission)
			return

		bot.shufflePlaylist()

	},

	"skip": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 2, "S")

		if (!hasPermission)
			return

		bot.deleteVideo(bot.currentUID)
	},

	// https://www.youtube.com/watch?v=O1adNgZl_3Q
	"squee": function(bot) {
		var squeeString = ""
		if (bot.squeeLimiter.getTokensRemaining() < 1 || bot.stats["muted"])
			return

		bot.squeeLimiter.removeTokens(1, function() {
			for (var i in bot.userlist) {
				if (bot.userlist[i]["name"].toLowerCase() !== bot.username.toLowerCase())
					squeeString += bot.userlist[i]["name"] + " "
			}
			bot.sendChatMsg(squeeString.substring(0, squeeString.length - 1))
		})
	},

	// Shows basic database stats
	"stats": function(bot) {
		bot.getGeneralStats()
	},

	"status": function(bot) {
		bot.sendStatus()
	},

	"talk": function(bot, username, msg) {
		if ((new Date().getTime() - bot.timeSinceLastTalk) / 1000 < 5)
			return bot.sendChatMsg("Talk cooldown")

		bot.timeSinceLastTalk = new Date().getTime()
		bot.talk(msg, function(resp) {
			bot.sendChatMsg(resp["message"])
		})
	},

	"translate": function(bot, username, data) {
		if (data && bot.mstranslateclient && bot.mstranslatesecret) {
			if ((new Date().getTime() - bot.timeSinceLastTranslate) / 1000 < 5)
				return bot.sendChatMsg("Translate cooldown")

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
				if (!from)
					return bot.sendChatMsg("[" + to + "] " + data)

				bot.sendChatMsg("[" + from + "->" + to + "] " + data)
			})
		}
	}, // End translate

	// Experimental
	// Only use if bot was installed with git
	// Executes git pull
	"update": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank < 5)
			return

		exec("git pull", function(error, stdout, stderr) {
			stdout = stdout.replace(/\+/g, "")
			stdout = stdout.replace(/\-/g, "")
			if (stdout.toLowerCase() === "already uptodate.\n")
				return bot.sendChatMsg("Already up-to-date.")

			bot.sendChatMsg(stdout)

			if (stdout.length > 20) {
				setTimeout(function() {
					process.exit(0)
				}, 2000)
			}
		})
	},

	"userlimit": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		var hasPermission = bot.checkPermission(username, 3, "L")

		if (!hasPermission)
			return

		var userlimitData = {
			match: data.match(/^(true|false) ?(\d*)|(\d*)/),
			callback: function() {
				bot.checkPlaylist()
				bot.writePersistentSettings()
			}
		}

		utils.handle(bot, "parseUserlimit", userlimitData)
	},

	"weather": function(bot, username, data) {
		if (!bot.weatherunderground)
			return bot.sendChatMsg("No weatherunderground API key!")

		if (!data || bot.muted)
			return

		var now = Date.now()
		var waitTime =
			((bot.weatherLimiter.curIntervalStart + bot.weatherLimiter.tokenBucket.interval) - now) / 1000

		if (bot.weatherLimiter.getTokensRemaining() < 1) {
			bot.sendChatMsg("Too many requests sent. Available in: " + waitTime + " seconds")
			return
		}

		var postAPI = function(resp) {
			var parsedJSON = JSON.parse(resp)
			if (parsedJSON["response"]["error"] || parsedJSON["response"]["results"])
				return bot.sendChatMsg("Error")

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
		}

		bot.weatherLimiter.removeTokens(1, function() {
			api.APICall(data, "weather", bot.weatherunderground, postAPI)
		})
	},

	"wolfram": function(bot, username, query) {
		if (!bot.wolfram)
			return bot.sendChatMsg("No wolfram API key!")

		if (bot.wolframLimiter.getTokensRemaining() < 1)
			return bot.sendChatMsg("Wolfram allowance used up for the day")

		api.APICall(query, "wolfram", bot.wolfram, function(result) {
			bot.sendChatMsg(result)
		})
	}
}

var handlerList = []
for (var key in chatHandlers) {
	handlerList.push({
		re: new RegExp("^\\$" + key + "(?:\\s|$)"),
		fn: chatHandlers[key]
	})
}

function handle(bot, username, msg, fromIRC) {
	for (var i = 0; i < handlerList.length; i++) {
		var h = handlerList[i]
		if (msg.toLowerCase().match(h.re)) {
			var rest
			if (msg.indexOf(" ") >= 0) {
				rest = msg.substring(msg.indexOf(" ") + 1)
			} else {
				rest = ""
			}
			return h.fn(bot, username, rest, fromIRC)
		}
	}

	// Goto custom commands if we can't find one here
	return custom.handle(bot, username, msg, fromIRC)
}

exports.handle = handle