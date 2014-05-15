var api = require("./apiclient")
var utils = require("./utils")
var custom = require("./custom")

var chatHandlers = {

	// See readme for chat commands

	"add": function(bot, username, data) {
		if (!data)
			return

		var permissionData = {
			permission: "A",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank >= 2 || hasPermission["hasPermission"])
			bot.addVideo(null, null, null, null, utils.handle(bot, "parseMediaLink", data))
	},

	"addrandom": function(bot, username, data) {
		var permissionData = {
			permission: "R",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (data <= 20 && rank >= 2 || hasPermission["hasPermission"] && data <= 20)
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

	"autodelete": function(bot, username, data) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank < 4)
			return

		bot.blockVideo()
	},

	"blacklist": function(bot, username, data) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank < 3)
			return

		bot.blacklistVideo()
	},

	"choose": function(bot, username, data) {
		if (!data)
			return

		var choices = data.trim().split(" ")
		var choice = choices[Math.floor(Math.random() * choices.length)]
		bot.sendChatMsg("[Choose: " + choices.join(" ") + "] " + choice)
	},

	"delete": function(bot, username, data) {
		if (!data)
			return
		data = data.split(" ")

		if (!data[0])
			return

		var permissionData = {
			permission: "D",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		var name = data[0]
		var num = data[data.length - 1]
		var uids = utils.handle(bot, "findVideosAddedByUser", name)
		var rank = utils.handle(bot, "getUser", username)["rank"]

		if (!num) {
			num = 1
		} else if (num === "all") {
			num = uids.length
		}

		if (username.toLowerCase() === name.toLowerCase()) {
			uids.reverse()
			for (var i = 0; i < num; i++) {
				bot.deleteVideo(uids[i])
			}
		} else if (rank >= 2 || hasPermission["hasPermission"]) {
			uids.reverse()
			for (var i = 0; i < num; i++) {
				bot.deleteVideo(uids[i])
			}
		}
	},

	"deletevideos": function(bot, username, data) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
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
				if (parsedJSON['response']['error']) {
					bot.sendChatMsg("Error")
					return
				}

				var location = parsedJSON['current_observation']['display_location']['full']

				if (tomorrow) {
					if ((location.split(", ")[1]).length != 2) {
						bot.sendChatMsg("Location: " +
							location + " Tomorrow: " +
							forecast['tomorrowDay']['fcttext_metric'])

						bot.sendChatMsg("Tomorrow Night: " +
							forecast['tomorrowNight']['fcttext_metric'])
						return
					} else {
						bot.sendChatMsg("Location: " +
							location + " Tomorrow: " +
							forecast['tomorrowDay']['fcttext'])

						bot.sendChatMsg("Tomorrow Night: " +
							forecast['tomorrowNight']['fcttext'])
					}
				} else {
					if ((location.split(", ")[1]).length != 2) {
						bot.sendChatMsg("Location: " +
							location + " Today: " +
							forecast['todayDay']['fcttext_metric'])

						bot.sendChatMsg("Tonight: " +
							forecast['todayNight']['fcttext_metric'])
						return
					} else {
						bot.sendChatMsg("Location: " +
							location + " Today: " +
							forecast['todayDay']['fcttext'])

						bot.sendChatMsg("Tonight: " +
							forecast['todayNight']['fcttext'])
					}
				}

			})
			bot.timeSinceLastWeather = new Date().getTime()
		}

		api.APICall(data, "forecast", bot.weatherunderground, function(resp) {
			var parsedJSON = JSON.parse(resp)
			if (parsedJSON['response']['error'] || parsedJSON['response']['results']) {
				bot.sendChatMsg("Error")
				return
			}

			var forecast = {
				"todayDay": parsedJSON['forecast']['txt_forecast']['forecastday'][0],
				"todayNight": parsedJSON['forecast']['txt_forecast']['forecastday'][1],
				"tomorrowDay": parsedJSON['forecast']['txt_forecast']['forecastday'][2],
				"tomorrowNight": parsedJSON['forecast']['txt_forecast']['forecastday'][3]
			}

			// Send forecast data to function to get location
			postForecast(forecast)
		})
	},

	"management": function(bot, username, data) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		var permissionData = {
			permission: "G",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		if (rank >= 2 && data.indexOf("on") == 0 || hasPermission["hasPermission"] && data.indexOf("on")) {
			console.log("!~~~! Bot is now managing the playlist")
			bot.stats["managing"] = true
			bot.writePersistentSettings()
		} else if (rank >= 2 && data.indexOf("off") == 0 || hasPermission["hasPermission"] && data.indexOf("off")) {
			console.log("!~~~! The bot is no longer managing the playlist")
			bot.stats["managing"] = false
			bot.writePersistentSettings()
		}

		if (bot.playlist.length === 0 && bot.stats["managing"])
			bot.addRandomVideos()
	},

	"mute": function(bot, username) {
		var permissionData = {
			permission: "M",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		var rank = utils.handle(bot, "getUser", username)["rank"]

		if ((rank >= 2 && !bot.stats["muted"]) || hasPermission["hasPermission"] && !bot.stats["muted"]) {
			bot.stats["muted"] = !bot.stats["muted"]
			console.log(username + " muted bot")
			bot.writePersistentSettings()
		}
	},

	"unmute": function(bot, username) {
		var permissionData = {
			permission: "M",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank >= 2 && bot.stats["muted"] || hasPermission["hasPermission"] && bot.stats["muted"]) {
			bot.stats["muted"] = !bot.stats["muted"]
			console.log(username + " unmuted bot")
			bot.writePersistentSettings()
		}
	},

	"permissions": function(bot, username, data) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
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

	"poll": function(bot, username, data) {
		if (!data)
			return

		var permissionData = {
			permission: "P",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		var rank = utils.handle(bot, "getUser", username)["rank"]

		if (rank < 2 && !hasPermission["hasPermission"])
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

	"endpoll": function(bot, username, data) {
		var permissionData = {
			permission: "P",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		var rank = utils.handle(bot, "getUser", username)["rank"]

		if (rank < 2 && !hasPermission["hasPermission"])
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

	"skip": function(bot, username, data) {
		var permissionData = {
			permission: "S",
			name: username.toLowerCase()
		}
		var hasPermission = utils.handle(bot, "userHasPermission", permissionData)
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank < 2 && !hasPermission["hasPermission"])
			return

		var id = bot.currentMedia["id"]
		var uid = utils.handle(bot, "findUIDOfVideoFromID", id)

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
			if (parsedJSON['response']['error'] || parsedJSON['response']['results']) {
				bot.sendChatMsg("Error")
				return
			}
			var location = parsedJSON['current_observation']['display_location']['full']
			var temp_f = parsedJSON['current_observation']['temp_f']
			var temp_c = parsedJSON['current_observation']['temp_c']
			var date = parsedJSON['current_observation']['observation_time']
			var weather = parsedJSON['current_observation']['weather']

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
			if (typeof results[0] !== 'undefined')
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

function handle(bot, username, msg) {
	for (var i = 0; i < handlerList.length; i++) {
		var h = handlerList[i];
		if (msg.match(h.re)) {
			var rest;
			if (msg.indexOf(" ") >= 0) {
				rest = msg.substring(msg.indexOf(" ") + 1);
			} else {
				rest = "";
			}
			return h.fn(bot, username, rest);
		}
	}

	// Goto custom commands if we can't find one here
	return custom.handle(bot, username, msg)
}

exports.handle = handle;