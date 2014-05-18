 var forever = require("forever-monitor")

 var child = new(forever.Monitor)("./lib/start.js", {
 	max: 10,
 	silent: false,
 })

 child.on("exit", function() {
 	console.log("$~~~$ CytubeBot has exited after 10 restarts\nShutting down")
 })

 child.on("restart", function() {
 	console.log("$~~~$ CytubeBot is restarting after a close\n")
 })

 child.start()