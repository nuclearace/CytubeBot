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

		bot.checkPermission(username, 2, "A", function(hasPermission) {
			if (!hasPermission)
				return

			var vidList = []
			var pos = "end"
			var splitData = data.split(" ")

			var addFun = function(vid, pos) {
				if (vid["type"] === "yt" && bot.youtubeapi)
					validator.validate(bot, vid["id"], vid["type"], null, function(unplayable) {
						if (unplayable)
							return
						else
							bot.addVideo(null, null, null, null, pos, vid)
					})
				else
					bot.addVideo(null, null, null, null, pos, vid)
			}

			if (splitData.length === 2)
				if (splitData[splitData.length - 1] === "next") {
					pos = "next"
					splitData.splice(splitData.length - 1, 1)
					data = splitData.join("")
				}

			addFun(utils.handle(bot, "parseMediaLink", data), pos)
		})
	},

	"addrandom": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 2, "R", function(hasPermission) {
			if (hasPermission && data <= 20)
				bot.addRandomVideos(data)
		})
	},

	"allow": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		bot.checkPermission(username, 2, "M", function(hasPermission) {
			if (!hasPermission)
				return

			var match = data.match(/(\w*)/)

			if (!match)
				return

			var user = match[1]

			var caller = utils.handle(bot, "getUser", username)

			if (user === bot.username)
				return

			var postUserRank = function(rank) {
				bot.checkPermission(user, 2, "M", function(userAlsoHasPermission) {
					var lesserOrEqualUser = user && caller.rank <= rank

					if (lesserOrEqualUser && !userAlsoHasPermission) {
						return bot.disallowUser(user, false)
					} else if (lesserOrEqualUser && userAlsoHasPermission)
						return

					return bot.disallowUser(user, false)
				})
			}
			bot.db.getUserRank(user, postUserRank)
		})
	},

	"anagram": function(bot, username, msg) {
		if ((new Date().getTime() - bot.timeSinceLastAnagram) / 1000 < 5)
			return bot.sendPM(username, "Anagram cooldown")

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
				bot.sendPM(username, "There was a problem with the request");
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

		bot.checkPermission(username, 3, null, function(hasPermission) {
			if (!hasPermission)
				return

			bot.blockVideo()
		})
	},

	"ban": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		bot.checkPermission(username, 2, "N", function(hasPermission) {
			if (!hasPermission)
				return

			bot.sendChatMsg("/ban " + data)
		})
	},

	"blacklist": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 3, null, function(hasPermission) {
			if (!hasPermission)
				return

			bot.blacklistVideo()
		})
	},

	"blacklistedusers": function(bot) {
		bot.listBlacklistedUsers()
	},

	"blacklistuser": function(bot, username, data, fromIRC) {
		if (typeof data === "undefined" || fromIRC)
			return

		bot.checkPermission(username, 3, null, function(hasPermission) {
			if (!hasPermission)
				return

			var match = data.match(/(\w*) (true|false)/)

			if (!match)
				return

			var user = match[1]
			var flag = match[2]

			if (user === bot.username)
				return

			if (flag === "true")
				flag = true
			else
				flag = false

			bot.blacklistUser(user, flag)
		})
	},

	"blockedusers": function(bot) {
		bot.listBlockedUsers()
	},

	"blockuser": function(bot, username, data, fromIRC) {
		if (fromIRC || !data)
			return

		bot.checkPermission(username, 3, null, function(hasPermission) {
			if (!hasPermission)
				return

			var match = data.match(/(\w*) (true|false)/)

			if (!match)
				return

			var user = match[1]
			var flag = match[2]

			if (user === bot.username)
				return

			if (flag === "true")
				flag = true
			else
				flag = false

			bot.blockUser(user, flag)
		})
	},

	"bump": function(bot, username, data, fromIRC) {
		if (fromIRC || !data)
			return

		bot.checkPermission(username, 2, "B", function(hasPermission) {
			if (!hasPermission)
				return

			var bumpData = utils.handle(bot, "parseBumpData", data)

			if (!bumpData)
				return

			utils.handle(bot, "genericUIDLoop", bumpData)
		})
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

	"currenttime": function(bot) {
		var currentTime = Math.round(bot.leaderData["currentTime"])

		bot.sendChatMsg("Current Time: " + currentTime)
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

		bot.checkPermission(username, 2, "D", function(hasPermission) {
			var deleteData = utils.handle(bot, "parseDeleteData", data)
			if (username.toLowerCase() === deleteData["name"].toLowerCase()) {
				utils.handle(bot, "genericUIDLoop", deleteData)
			} else if (hasPermission) {
				utils.handle(bot, "genericUIDLoop", deleteData)
			}
		})
	},

	"deletevideos": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 5, null, function(hasPermission) {
			if (!hasPermission)
				return

			bot.deleteVideosFromDatabase(data)
		})
	},

	"disallow": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		bot.checkPermission(username, 2, "M", function(hasPermission) {
			if (!hasPermission)
				return

			var match = data.match(/(\w*)/)

			if (!match)
				return

			var user = match[1].toLowerCase()

			var caller = utils.handle(bot, "getUser", username)

			if (user === bot.username)
				return

			var postUserRank = function(rank) {
				bot.checkPermission(user, 2, "M", function(userAlsoHasPermission) {
					var lesserOrEqualUser = user && caller.rank <= rank

					if (lesserOrEqualUser && !userAlsoHasPermission) {
						return bot.disallowUser(user, true)
					} else if (lesserOrEqualUser && userAlsoHasPermission)
						return

					return bot.disallowUser(user, true)
				})
			}
			bot.db.getUserRank(user, postUserRank)
		})
	},

	"duplicates": function(bot, username, data, fromIRC) {
		if (fromIRC || bot.playlist.length === 0)
			return

		bot.checkPermission(username, 2, "D", function(hasPermission) {
			if (!hasPermission)
				return

			var lookedUp = []
			var numDeleted = 0
			var inLookedUp = function(vid) {
				for (var k = 0; k < lookedUp.length; k++) {
					if (lookedUp[k]["id"] === vid["media"]["id"] &&
						lookedUp[k]["type"] === vid["media"]["type"])
						return true
				}
				return false
			}

			var duplicateUIDs = bot.playlist.map(function(video) {
				if (inLookedUp(video))
					return video["uid"]
				else
					lookedUp.push({
						id: video["media"]["id"],
						type: video["media"]["type"]
					})
			})

			// Fix duplicateUIDs
			duplicateUIDs.forEach(function(vid, index) {
				numDeleted++
				if (typeof duplicateUIDs[index] === "undefined") {
					numDeleted--
					return duplicateUIDs.splice(index, 1)
				}
			})

			var deleteData = {
				"kind": "deleteVideo",
				"num": "all",
				"uids": duplicateUIDs.reverse()
			}

			utils.handle(bot, "genericUIDLoop", deleteData)
			bot.sendChatMsg("Deleted: " + numDeleted)
		})
	},

	"emotes": function(bot) {
		if (!bot.enableWebServer)
			return bot.sendChatMsg("WebServer not enabled")

		bot.sendChatMsg(bot.webURL + ":" + bot.webPort + "/emotes")
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

	"internals": function(bot) {
		if (!bot.enableWebServer)
			return bot.sendChatMsg("WebServer not enabled")

		bot.sendChatMsg(bot.webURL + ":" + bot.webPort + "/internals")
	},

	"ipban": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		bot.checkPermission(username, 2, "N", function(hasPermission) {
			if (!hasPermission)
				return

			bot.sendChatMsg("/ipban " + data)
		})
	},

	"kick": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		bot.checkPermission(username, 2, "I", function(hasPermission) {
			if (!hasPermission)
				return

			bot.sendChatMsg("/kick " + data)
		})
	},

	"management": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 2, "G", function(hasPermission) {
			if (hasPermission && data.indexOf("on") !== -1) {
				bot.logger.syslog.log("!~~~! Bot is now managing the playlist")
				bot.stats["managing"] = true
				bot.writePersistentSettings()
			} else if (hasPermission && data.indexOf("off") !== -1) {
				bot.logger.syslog.log("!~~~! The bot is no longer managing the playlist")
				bot.stats["managing"] = false
				bot.writePersistentSettings()
			}

			if (bot.playlist.length === 0 && bot.stats["managing"])
				bot.addRandomVideos()
		})
	},

	"mute": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 2, "M", function(hasPermission) {
			if (hasPermission && !bot.stats["muted"]) {
				bot.stats["muted"] = !bot.stats["muted"]
				bot.logger.syslog.log("!~~~! " + username + " muted bot")
				bot.writePersistentSettings()
			}
		})
	},

	"unmute": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 2, "M", function(hasPermission) {
			if (hasPermission && bot.stats["muted"]) {
				bot.stats["muted"] = !bot.stats["muted"]
				bot.logger.syslog.log("!~~~! " + username + " unmuted bot")
				bot.writePersistentSettings()
			}
		})
	},

	"permissions": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 3, null, function(hasPermission) {
			var match = data.trim().match(/^((\+|\-)((ALL)|(.*)) )?(.*)$/)
			var permission = match[1]
			var name = match[6].toLowerCase()

			if (!hasPermission)
				return
			else if (permission)
				permission = permission.toUpperCase()

			bot.handleHybridModPermissionChange(permission, name)
		})
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

		bot.checkPermission(username, 2, "P", function(hasPermission) {
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
		})
	},

	"endpoll": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 2, "P", function(hasPermission) {
			if (!hasPermission)
				return

			bot.endPoll()
		})
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

		bot.checkPermission(username, 2, "K", function(hasPermission) {
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
		})
	},

	"settime": function(bot, username, data, fromIRC) {
		if (fromIRC || !data)
			return

		bot.checkPermission(username, 2, "T", function(hasPermission) {
			if (!hasPermission)
				return

			var parsedTime = data.match(/(\+|\-)?(\d*)/)
			var plusMinus = parsedTime[1]
			var time = parseInt(parsedTime[2])

			if (isNaN(time))
				return bot.sendPM(username, "Time given is not a number")

			if (bot.sendAssignLeader(bot.username))
				return bot.logger.cytubelog.log("!~~~! Cannot set leader: Insufficient rank")

			if (plusMinus) {
				if (plusMinus === "+")
					time = bot.leaderData["currentTime"] + time

				if (plusMinus === "-")
					time = bot.leaderData["currentTime"] - time
			}

			var setFun = function(callback) {
				bot.sendMediaUpdate(time, false)
				bot.sendAssignLeader("")
				callback()
			}

			var settimeObject = {
				settime: true,
				fun: setFun
			}

			bot.waitingFunctions.push(settimeObject)
		})
	},

	"shuffle": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 2, "U", function(hasPermission) {
			if (!hasPermission)
				return

			bot.shufflePlaylist()
		})
	},

	"skip": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.checkPermission(username, 2, "S", function(hasPermission) {
			if (!hasPermission)
				return

			bot.deleteVideo(bot.currentUID)
		})
	},

	// Shows basic database stats
	"stats": function(bot) {
		bot.getGeneralStats()
		if (bot.enableWebServer)
			bot.sendChatMsg(bot.webURL + ":" + bot.webPort + "/")
	},

	"status": function(bot, username) {
		if ((new Date().getTime() - bot.timeSinceLastStatus) / 1000 < 120)
			return bot.sendPM(username, "Status cooldown")

		bot.timeSinceLastStatus = new Date().getTime()
		bot.sendStatus()
	},

	"talk": function(bot, username, msg) {
		if ((new Date().getTime() - bot.timeSinceLastTalk) / 1000 < 5)
			return bot.sendPM(username, "Talk cooldown")

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
				if (data.indexOf("must be a valid language") !== -1)
					return bot.sendChatMsg("Error: One or more invalid languages")

				if (!from)
					return bot.sendChatMsg("[" + to + "] " + data)

				bot.sendChatMsg("[" + from + "->" + to + "] " + data)
			})
		}
	}, // End translate

	"unban": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		bot.checkPermission(username, 2, "N", function(hasPermission) {
			if (!hasPermission)
				return

			var unbanFun = function(callback) {
				for (var i = 0; i < bot.banlist.length; i++) {
					if (bot.banlist[i]["name"].toLowerCase() === data.toLowerCase()) {
						var unbanJSON = {
							id: bot.banlist[i]["id"],
							name: bot.banlist[i]["name"]
						}
						bot.sendUnban(unbanJSON)
					}
				}
				callback()
			}

			// Create an object that will be used to execute the unban when we
			// get the banlist
			var unbanObject = {
				unban: true,
				fun: unbanFun
			}

			// add to the waitlist
			bot.waitingFunctions.push(unbanObject)
			bot.socket.emit("requestBanlist")
		})
	},

	// Experimental
	// Only use if bot was installed with git
	// Executes git pull
	"update": function(bot, username, data, fromIRC) {
		if (fromIRC)
			return

		bot.db.getUserRank(username, function(rank) {
			if (rank < 5)
				return

			exec("git pull", function(error, stdout, stderr) {
				stdout = stdout.replace(/\+/g, "")
				stdout = stdout.replace(/\-/g, "")
				stdout = stdout.replace(/\(/g, "")
				stdout = stdout.replace(/\)/g, "")
				if (stdout.toLowerCase() === "already uptodate.\n")
					return bot.sendChatMsg("Already up-to-date.")

				bot.sendChatMsg(stdout)

				if (stdout.length > 20) {
					setTimeout(function() {
						process.exit(0)
					}, 2000)
				}
			})
		})
	},

	"userlimit": function(bot, username, data, fromIRC) {
		if (!data || fromIRC)
			return

		bot.checkPermission(username, 3, "L", function(hasPermission) {
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
		})
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

function handle(bot, username, msg, fromIRC) {
	var split = msg.split(" ")
	var command = String(split.splice(0, 1))
	command = command.substring(1, command.length)
	var rest = split.join(" ")

	if (command in chatHandlers)
		return chatHandlers[command](bot, username, rest, fromIRC)

	// Goto custom commands if we can't find one here
	return custom.handle(bot, username, msg, fromIRC)
}

exports.handle = handle