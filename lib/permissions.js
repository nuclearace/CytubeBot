var utils = require("./utils")

var perms = {
	// Checks if the user has a given permission
	// Returns true or false depending if they have that perm
	// username - The user we're looking up
	// rank - The rank the user should have
	// permission - The permission to look up 
	"checkPermission": function(bot, data) {
		var username = data["username"]
		var rank = data["rank"]
		var permission = data["permission"]
		var userRank = 0
		var hybridPerm = false

		if (rank) {
			try {
				userRank = utils.handle(bot, "getUser", username)["rank"]
			} catch (error) {
				bot.logger.errlog.log("!~~~!: Error looking up rank: CytubeBot.checkPermission")
			}
		}

		if (permission) {
			var permissionData = {
				permission: permission,
				name: username.toLowerCase()
			}
			try {
				hybridPerm = perms.userHasPermission(bot, permissionData)["hasPermission"]
			} catch (e) {
				hybridPerm = false
			}
		}

		if (userRank >= rank)
			return true
		else if (hybridPerm)
			return true
		else
			return false
	},

	// Used by $permissions
	// Handles a change in hybridMods or calls sendHybridModPermissions if no permission
	// is given.
	// data - Contains the name and permission we are changing.
	"handleHybridModPermissionChange": function(bot, data) {
		var permission = ""
		var name = data["name"]

		if (data["permission"])
			permission = data["permission"]
		else
			return perms.sendHybridModPermissions(bot, name)

		var change = permission.substring(0, 1)
		permission = permission.substring(1, permission.length).trim()

		if (!(name in bot.stats["hybridMods"]) && change === "+") {
			bot.stats["hybridMods"][name] = permission
			bot.sendHybridModPermissions(name)
			bot.writePersistentSettings()
			return
		}

		var permissionData = {
			permission: permission,
			name: name
		}
		var hasPermission = perms.userHasPermission(bot, permissionData)

		if (hasPermission["hasPermission"]) {
			var permissions = hasPermission["permissions"]
			if (change === "-") {
				for (var i = 0; i < permissions.length; i++) {
					bot.stats["hybridMods"][name] = bot.stats["hybridMods"][name].replace(permissions[i], "")
				}
			}
		} else if (change === "+") {
			if (permission === "ALL") {
				bot.stats["hybridMods"][name] = ""
				bot.stats["hybridMods"][name] = permission
			} else {
				bot.stats["hybridMods"][name] += permission
			}
		} else if (change === "-" && permission === "ALL") {
			bot.stats["hybridMods"][name] = ""
		}

		if (bot.stats["hybridMods"][name] === "")
			delete bot.stats["hybridMods"][name]

		bot.sendHybridModPermissions(name)
		bot.writePersistentSettings()
	},

	// Sends the hybridmod permissions for name
	// name - name to send hybridmod permissions for
	"sendHybridModPermissions": function(bot, name) {
		if (name)
			bot.sendChatMsg(name + ": " + bot.stats["hybridMods"][name])
	},

	// Checks to see if a user has permission to do something
	// Returns an object containing: hasPermission, which will be true/false depending
	// if the user has that permission, and permissions, 
	// which is an array of the permissions matched.
	// bot - Reference to the current bot
	// permissionData - Contains the permissions we are looking for and the name
	// of the user.
	"userHasPermission": function(bot, permissionData) {
		var name = permissionData["name"]
		var permission = permissionData["permission"]
		var returnData = {
			hasPermission: false,
			permissions: []
		}

		if (!bot.stats["hybridMods"])
			return returnData

		if (name in bot.stats["hybridMods"]) {
			// Loop through the permissions for that user, looking for matching ones
			for (var i = 0; i < permission.length; i++) {
				if (bot.stats["hybridMods"][name].match(permission[i]))
					returnData["permissions"].push(permission[i])
			}
			if (returnData["permissions"].length !== 0) {
				returnData["hasPermission"] = true
				return returnData // If we found matching permissions
			} else {
				if (bot.stats["hybridMods"][name].match("ALL"))
					returnData["hasPermission"] = true

				return returnData // If we didn't, or we found all
			}
		} else {
			return returnData // We didn't find the user
		}
	}
}

function handle(bot, command, data) {
	if (command in perms)
		return perms[command](bot, data)
}

exports.handle = handle