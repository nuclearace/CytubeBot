var api = require("./apiclient")
var utils = require("./utils")

var chatHandlers = {

	"anagram": function (bot, username, msg) {
		if (msg.length < 7) {
			bot.sendChatMsg("Message too short")
			return
		} else if (msg.length > 30) {
			bot.sendChatMsg("Message too long")
			return
		}

		api.APICall(msg, "anagram", null, function (resp) {
			try {
				bot.sendChatMsg("[" + msg + "] -> " + resp[1])
			} catch (e) {
				bot.sendChatMsg("There was a problem with the request");
			}
		});
	},

	"talk": function (bot, username, msg) {
		api.APICall(msg, "talk", null, function (resp) {
			bot.sendChatMsg(resp["message"])
		})
	},
	
	"mute": function (bot, username) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank >= 2 && !bot.muted) {
			bot.muted = !bot.muted
			console.log(username + " muted bot")
		}
	},

	"unmute": function (bot, username) {
		var rank = utils.handle(bot, "getUser", username)["rank"]
		if (rank >= 2 && bot.muted) {
			bot.muted = !bot.muted
			console.log(username + " unmuted bot")
		}
	},

	"dubs": function (bot, username) {
		var num = Math.floor((Math.random() * 100000000) + 1)
		bot.sendChatMsg(username + ": " + num)
	},

	"wolfram": function (bot, username, query) {
		if (!bot.wolfram) {
			console.log("### No wolfram API key!")
			return
		}
		api.APICall(query, "wolfram", bot.wolfram, function (results) {
			if (typeof results[0] !== 'undefined')
				bot.sendChatMsg("[" + query + "] " + results[1]["subpods"][0]["text"])
			else
				bot.sendChatMsg("WolframAlpha query failed")
		})
	},

	"processinfo": function (bot) {
		var info = process.memoryUsage()
		bot.sendChatMsg("Heap total: " + info["heapTotal"] + " Heap used: " + info["heapUsed"])
	},

	"ask": function (bot, username, msg) {
		var answers = ["Yes", "No"]
		var answer = answers[Math.floor(Math.random() * 2)]
		bot.sendChatMsg("[" + msg + "] " + answer)
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