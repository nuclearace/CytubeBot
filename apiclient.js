var http = require("http");
var https = require("https");
var domain = require("domain");

var APIs = {
	anagram: function (msg, callback) {
		var options = {
			host: "anagramgenius.com",
			path: "/server.php?" + "source_text=" + encodeURI(msg) + "&vulgar=1",
			timeout: 20
		};

		urlRetrieve(http, options, function (status, data) {
			data = data.match(/.*<span class=\"black-18\">'(.*)'<\/span>/)
			callback(data)
		});
	}
}

var urlRetrieve = function (transport, options, callback) {
	var dom = domain.create();
	dom.on("error", function (err) {
		console.log(err.stack);
		console.log("urlRetrieve failed: " + err);
		console.log("Request was: " + options.host + options.path);
		callback(503, err);
	});
	dom.run(function () {
		var req = transport.request(options, function (res) {
			var buffer = "";
			res.setEncoding("utf-8");
			res.on("data", function (chunk) {
				buffer += chunk;
			});
			res.on("end", function () {
				callback(res.statusCode, buffer);
			});
		});

		req.end();
	});
};

module.exports = {
	APIs: APIs,
	APICall: function (msg, type, callback) {
		if (type in this.APIs)
			this.APIs[type](msg, callback)
		else {
			console.log("Unknown api");
		}
	}
}