var chatHandlers = {
	"test": function (bot, data) {
		console.log(bot + " " + data);
		bot.sendChatMsg(data);
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