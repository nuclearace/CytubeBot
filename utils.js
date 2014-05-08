var utilHandlers = {

	"findUser": function(bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"] == user)
				return u
		}
	},

	"getUser": function(bot, user) {
		for (var u in bot.userlist) {
			if (bot.userlist[u]["name"] == user)
				return bot.userlist[u]
		}
	},

	"isOnPlaylist": function(bot, video) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['media']["id"] == video["item"]["media"]["id"]) {
				return true
			}
		}
	},

	"findIndexOfVideoFromVideo": function(bot, video) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['media']["id"] == video["item"]["media"]["id"]) {
				return i
			}
		}
	},

	"findIndexOfVideoFromUID": function(bot, uid) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['uid'] == uid) 
				return i
		}
	},

	"findIndexOfVideoFromID": function(bot, id) {
		for (var i = 0; i < bot.playlist.length; i++) {
			if (bot.playlist[i]['media']["id"] === id) 
				return bot.playlist[i]["uid"]
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