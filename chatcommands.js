var api = require("./apiclient")

var chatHandlers = {
	"test": function (bot, msg) {
		console.log(bot + " " + msg);
		bot.sendChatMsg(msg);
	},

	"anagram": function (bot, msg) {
		if (msg.length < 7) {
			bot.sendChatMsg("Message too short")
			return
		} else if (msg.length > 30) {
			bot.sendChatMsg("Message too long")
			return
		}

		api.APICall(msg, "anagram", function (resp) {
			try {
				bot.sendChatMsg("[" + msg + "] -> " + resp[1])
			} catch (e) {
				bot.sendChatMsg("There was a problem with the request");
			}
		});
	},

	"talk": function (bot, msg) {
		api.APICall(msg, "talk", function (resp) {
			bot.sendChatMsg(resp["message"])
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

function handle(bot, msg) {
	for (var i = 0; i < handlerList.length; i++) {
		var h = handlerList[i];
		if (msg.match(h.re)) {
			var rest;
			if (msg.indexOf(" ") >= 0) {
				rest = msg.substring(msg.indexOf(" ") + 1);
			} else {
				rest = "";
			}
			return h.fn(bot, rest);
		}
	}
}

exports.handle = handle;