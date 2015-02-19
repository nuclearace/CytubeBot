socket = io(IO_URL)
socket.on("connect", function() {
	socket.emit("getInternals")
})

// Handle the bot's status info
socket.on("botStatus", function(status) {
	var managing = status["managing"]
	var muted = status["muted"]
	var hybridMods = status["hybridMods"]
	var userLimit = status["userLimit"]
	var userLimitNum = status["userLimitNum"]
	var disallowed = status["disallow"]

	var statusString = "Managing: " + managing + "<br>"
	statusString += "Muted: " + muted + "<br>"
	statusString += "Hybrid Mods: " + JSON.stringify(hybridMods) + "<br>"
	statusString += "Userlimit: " + userLimit + "<br>"
	statusString += "User Limit Number: " + userLimitNum + "<br>"
	statusString += "Disallowed: " + JSON.stringify(disallowed)
	$("#statusspan").html(statusString)
})

// Handle bot info
socket.on("botInfo", function(botInfo) {
	var botInfoString = ""
	var server = botInfo["server"]
	var room = botInfo["room"]
	var username = botInfo["username"]
	var useLogger = botInfo["useLogger"]
	var deleteIfBlockedIn = botInfo["deleteIfBlockedIn"]
	var socketPort = botInfo["socketPort"]
	var webURL = botInfo["webURL"]
	var webPort = botInfo["webPort"]
	var previousUID = botInfo["previousUID"]
	var currentUID = botInfo["currentUID"]
	var currentMedia = JSON.stringify(botInfo["currentMedia"])
	var isLeader = botInfo["isLeader"]
	var startTime = botInfo["startTime"]
	var heapTotal = botInfo["heapTotal"]
	var heapUsed = botInfo["heapUsed"]

	botInfoString += "Cytube Server: " + server + "<br>"
	botInfoString += "Cytube Room: " + room + "<br>"
	botInfoString += "Cytube Username: " + username + "<br>"
	botInfoString += "Logging: " + useLogger + "<br>"
	botInfoString += "Delete videos blocked in: " + deleteIfBlockedIn + "<br>"
	botInfoString += "Socket.io port: " + socketPort + "<br>"
	botInfoString += "Web URL: " + webURL + "<br>"
	botInfoString += "Web Port: " + webPort + "<br>"
	botInfoString += "Previous UID: " + previousUID + "<br>"
	botInfoString += "current UID: " + currentUID + "<br>"
	botInfoString += "Current Media: " + currentMedia + "<br>"
	botInfoString += "isLeader: " + isLeader + "<br>"
	botInfoString += "startTime: " + startTime + "<br>"
	botInfoString += "Memory heap total: " + heapTotal + "<br>"
	botInfoString += "Memory heap used: " + heapUsed + "<br>"
	botInfoString += calculateUptime(startTime) + "<br>"

	$("#botinfospan").html(botInfoString)
})

// Handle the userlist info
socket.on("userlist", function(userlist) {
	var stringyUserlist = ""
	userlist.forEach(function(element, index, array) {
		stringyUserlist += JSON.stringify(element) + "<br>"
	})
	$("#userlistspan").text("Number of users: " + userlist.length)
	$("#userlistdetail").html(stringyUserlist)
})

// Handle the playlist info
socket.on("playlist", function(playlist) {
	var stringyPlaylist = ""
	playlist.forEach(function(element, index, array) {
		stringyPlaylist += JSON.stringify(element) + "<br>"
	})
	$("#playlistspan").text("Number of items on playlist: " + playlist.length)
	$("#playlistdetail").html(stringyPlaylist)
})

$("#playlistdetailsbutton").click(function() {
	if (!$("#playlistdetail").is(":visible"))
		$("#playlistdetail").show()
	else
		$("#playlistdetail").hide()
})

$("#userlistdetailsbutton").click(function() {
	if (!$("#userlistdetail").is(":visible"))
		$("#userlistdetail").show()
	else
		$("#userlistdetail").hide()
})

var calculateUptime = function(startTime) {
	var timeNow = new Date().getTime()
	var time = (timeNow - startTime) / 1000
	var h = "0", m = "", s = ""
	var returnString = "Uptime: hours: %h, minutes: %m, seconds: %s"

	if (time >= 3600) {
		h = "" + Math.floor(time / 3600)
		if (h.length < 2)
			h = "0" + h
		time %= 3600
	}

	m = "" + Math.floor(time / 60)
	if (m.length < 2)
		m = "0" + m

	s = "" + (time % 60)
	if (s.length < 2)
		s = "0" + s

	returnString = returnString.replace("%h", h)
	returnString = returnString.replace("%m", m)
	returnString = returnString.replace("%s", s)

	return returnString
}

setInterval(function() {
	socket.emit("getInternals")
}, 5000)