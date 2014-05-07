var utilHandlers = {

	"findUser": function (bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"] == user) 
				return u
		}
	},

	"getUser": function (bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"] == user)
				return bot.userlist[u]
		}
	}
}

var handlerList = [];
for (var key in utilHandlers) {
	handlerList.push({
		re: new RegExp(key),
		fn: utilHandlers[key]
	});
}

function handle(bot, command, data) {
	for (var i = 0; i < handlerList.length; i++) {
		var h = handlerList[i];
		if (command.match(h.re)) {
			return h.fn(bot, data);
		}
	}
}

exports.handle = handle;