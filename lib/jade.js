var jade = require("jade")
var fs = require("fs")
var path = require("path")
var pages = path.join(__dirname, "..", "www")

var cache = {}

    function sendJade(res, page, locals) {
        if (!(page in cache)) {
            var file = path.join(pages, page + ".jade")
            var fn = jade.compile(fs.readFileSync(file), {
                filename: file
            })
            cache[page] = fn
        }
        var html = cache[page](locals)
        res.send(html)
    }

module.exports = {
    sendJade: sendJade
}