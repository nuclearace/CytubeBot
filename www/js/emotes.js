socket = io.connect(IO_URL)
setTimeout(function() {
	socket.emit("getRoom")
	socket.emit("getEmotes")
}, 1000);

var addEmote = function(emote) {
	var name = emote["name"]
	var image = emote["image"]
	var tbl = $("#emotediv table")
	var tr = $("<tr/>").appendTo(tbl)

	var emoteDiv = $("<span>").text(name)
		.appendTo($("<td/>").appendTo(tr))

	var popoverData = {
		html: true,
		trigger: "hover",
		content: '<img src="' + image + '" class="channel-emote">'
	}
	emoteDiv.popover(popoverData)
}

var handleEmotes = function(emotes) {
	emotes.forEach(function(emote) {
		addEmote(emote)
	})
}

var handleRoom = function(room) {
	$("h1").text(room + " Emotes")
}

socket.on("emotes", handleEmotes)
socket.on("room", handleRoom)