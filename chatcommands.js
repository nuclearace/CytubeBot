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
		}

		api.APICall(msg, "anagram", function (e) {
			bot.sendChatMsg("[" + msg + "] -> " + e[1])
		});
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