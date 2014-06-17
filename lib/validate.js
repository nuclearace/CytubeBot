var api = require("./apiclient")

var APIs = {
	// Validates a youtube video
	"yt": function(bot, id, type, title, callback) {
		if (!bot.youtubeapi)
			return callback(false)

		api.APICall(id, "youtubelookup", bot.youtubeapi, function(status, vidInfo) {
			if (status !== true) {
				bot.sendChatMsg("Invalid video: " + id)
				if (title)
					bot.db.flagVideo(type, id, 1, title)
				callback(true)
				return
			}

			var blocked = false
			var allowed = {}
			var shouldDelete = false

			// See what countries are blocked
			try {
				blocked = vidInfo["contentDetails"]["regionRestriction"]["blocked"]
			} catch (e) {
				blocked = false
			}

			// See what countries are allowed to embed the video
			try {
				allowed = vidInfo["contentDetails"]["regionRestriction"]["allowed"]
			} catch (e) {
				allowed = false
			}

			// Should we delete the video
			if (bot.deleteIfBlockedIn) {
				if (allowed && allowed.indexOf(bot.deleteIfBlockedIn) === -1) {
					shouldDelete = true
				} else if (blocked && blocked.indexOf(bot.deleteIfBlockedIn) !== -1) {
					shouldDelete = true
				}
			}

			if (!vidInfo["status"]["embeddable"]) {
				bot.sendChatMsg("Embedding disabled: " + id)
				if (title)
					bot.db.flagVideo(type, id, 1, title)
				return callback(true)
			} else if (shouldDelete) {
				bot.sendChatMsg("Video blocked in: " + bot.deleteIfBlockedIn +
					". id: " + id)
				if (title)
					bot.db.flagVideo(type, id, 1, title)
				return callback(true)
			} else {
				callback(false)
			}
		})
	}
}

function validate(bot, id, type, title, callback) {
	if (type in APIs)
		return APIs[type](bot, id, type, title, callback)
}

exports.validate = validate