var api = require("./apiclient")
var utils = require("./utils")

var chatHandlers = {

	"anagram": function(bot, username, msg) {
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
		});
	},

	"talk": function(bot, username, msg) {
		api.APICall(msg, "talk", null, function(resp) {
			bot.sendChatMsg(resp["message"])
		})
	},

	"mute": function(bot, username) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank >= 2 && !bot.muted) {
			bot.muted = !bot.muted
			console.log(username + " muted bot")
		}
	},

	"unmute": function(bot, username) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank >= 2 && bot.muted) {
			bot.muted = !bot.muted
			console.log(username + " unmuted bot")
		}
	},

	"dubs": function(bot, username) {
		var num = Math.floor((Math.random() * 100000000) + 1)
		bot.sendChatMsg(username + ": " + num)
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
	},

	"processinfo": function(bot) {
		var info = process.memoryUsage()
		bot.sendChatMsg("Heap total: " + info["heapTotal"] + " Heap used: " + info["heapUsed"])
	},

	"ask": function(bot, username, msg) {
		var answers = ["Yes", "No"]
		var answer = answers[Math.floor(Math.random() * 2)]
		bot.sendChatMsg("[Ask: " + msg + "] " + answer)
	},

	"quote": function(bot, username, nick) {
		bot.getQuote(nick)
	},

	"weather": function(bot, username, data) {
		if (!bot.weatherunderground) {
			console.log("### No weatherunderground API key!")
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

	"status": function(bot, username, data) {
		bot.sendStatus()
	},

	"playlistdebug": function(bot, username, data) {
		if (data) {
			console.log(bot.playlist[data])
			return
		}
		console.log(bot.playlist);
	},

	"addrandom": function(bot, username, data) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (data <= 20 && rank > 2)
			bot.addRandomVideos(data, username)
	},

	"blacklist": function(bot, username, data) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank < 3)
			return

		bot.blacklistVideo()
	},

	"autodelete": function(bot, username, data) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank < 4)
			return

		bot.blockVideo()
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
}

exports.handle = handle;