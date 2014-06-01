 var forever = require("forever-monitor")

 var child = new(forever.Monitor)("./lib/start.js", {
 	max: 20,
 	silent: false,
 	minUptime: 5000,
 	errFile: "./err.log"
 })

 child.on("exit", function() {
 	console.log("$~~~$ CytubeBot has exited after 20 restarts or there was a problem\n")
 	console.log("$~~~$ Shutting down")
 })

 child.on("restart", function() {
 	console.log("$~~~$ CytubeBot is restarting after a close\n")
 })

 child.start()