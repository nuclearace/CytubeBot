var forever = require("forever-monitor")
var fs = require("fs")

var child = new(forever.Monitor)("./lib/start.js", {
    max: 21,
    silent: false,
    minUptime: 5000,
    errFile: "./err.log"
})

var writeTimes = function() {
    fs.writeFile("times", String(child.times), function(err) {
        if (err) {
            console.log(err)
            child.stop()
            process.exit(1)
        }
    })
}

child.on("exit", function() {
    console.log("$~~~$ CytubeBot has exited after 20 restarts or there was a problem\n")
    console.log("$~~~$ Shutting down")

})

child.on("restart", function() {
    console.log("$~~~$ CytubeBot is restarting after a close\n")
    writeTimes()
})

child.start()
writeTimes()
