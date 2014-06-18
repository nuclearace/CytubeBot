socket = io.connect(IO_URL)
setTimeout(function() {
	socket.emit("getRoom")
	socket.emit("getEmotes")
}, 1000);

var addEmote = function(emote) {
	var name = emote["name"]
	var image = emote["image"]
	var emoteImg = $("<img>").attr("class", "channel-emote")
		.attr("src", image)
		.attr("title", name)
		.appendTo($("#emotediv"))
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