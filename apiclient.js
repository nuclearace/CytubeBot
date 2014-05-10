var http = require("http")
var domain = require("domain")
var wolfram = require("wolfram-alpha")
var Cleverbot = require("cleverbot-node")
var WunderNodeClient = require("wundernode")
var MsTranslator = require('mstranslator')

var APIs = {
	anagram: function(msg, apikey, callback) {
		var options = {
			host: "anagramgenius.com",
			path: "/server.php?" + "source_text=" + encodeURI(msg) + "&vulgar=1",
			timeout: 20
		};

		urlRetrieve(http, options, function(status, data) {
			data = data.match(/.*<span class=\"black-18\">'(.*)'<\/span>/)
			callback(data)
		});
	},

	talk: function(msg, apikey, callback) {
		var bot = new Cleverbot
		var msg = {
			message: msg
		}
		bot.write(msg["message"], function(resp) {
			callback(resp)
		})
	},

	wolfram: function(query, apikey, callback) {
		var client = wolfram.createClient(apikey);
		client.query(query, function(err, result) {
			if (err) throw err
			callback(result)
		});
	},

	weather: function(data, apikey, callback) {
		var wunder = new WunderNodeClient(apikey, false, 10, 'seconds')

		if (data.split(" ").length == 0) {
			var query = data
			wunder.conditions(data, function(err, resp) {
				if (err) {
					console.log(err)
				} else {
					callback(resp)
					return
				}
			})
		}

		try {
			var stringData = data.split(" ")

			// Strip off the country
			var country = stringData[stringData.length - 1]
			stringData.splice(stringData.length - 1, 1)

			var fixedString = ""
			// Put the location together for the query
			for (var k in stringData) {
				fixedString += stringData[k] + "_"
			}

			// Trim off the last _
			fixedString = fixedString.slice(0, fixedString.lastIndexOf("_"))

			var query = country + "/" + fixedString
			wunder.conditions(query, function(err, resp) {
				if (err) {
					console.log(err)
					return
				}
				callback(resp)
			})
		} catch (e) {
			console.log(e)
		}
	}, // end weather

	"forecast": function(data, apikey, callback) {
		var wunder = new WunderNodeClient(apikey, false, 10, 'seconds')
		if (data.split(" ").length == 0) {
			var query = data
			wunder.forecast(data, function(err, resp) {
				if (err) {
					console.log(err)
				} else {
					callback(resp)
					return
				}
			})
		}
		try {
			var stringData = data.split(" ")

			// Strip off the country
			var country = stringData[stringData.length - 1]
			stringData.splice(stringData.length - 1, 1)

			var fixedString = ""
			// Put the location together for the query
			for (var k in stringData) {
				fixedString += stringData[k] + "_"
			}

			// Trim off the last _
			fixedString = fixedString.slice(0, fixedString.lastIndexOf("_"))

			var query = country + "/" + fixedString
			wunder.forecast(query, function(err, resp) {
				if (err) {
					console.log(err)
					return
				}
				callback(resp)
			})
		} catch (e) {
			console.log(e)
		}

	}, // End forecast

	"translate": function(query, apiKeys, callback) {
		var mst_id = apiKeys["clientid"]
		var mst_secret = apiKeys["secret"]
		var client = new MsTranslator({
			client_id: mst_id,
			client_secret: mst_secret
		})

		client.initialize_token(function(keys) {
			client.translate(query, function(err, data) {
				if (err) {
					console.log(err)
					return
				}
				callback(data)
			});
		});
	}
}

var urlRetrieve = function(transport, options, callback) {
	var dom = domain.create()
	dom.on("error", function(err) {
		console.log(err.stack)
		console.log("urlRetrieve failed: " + err)
		console.log("Request was: " + options.host + options.path)
		callback(503, err)
	});
	dom.run(function() {
		var req = transport.request(options, function(res) {
			var buffer = ""
			res.setEncoding("utf-8")
			res.on("data", function(chunk) {
				buffer += chunk
			})
			res.on("end", function() {
				callback(res.statusCode, buffer)
			})
		})

		req.end()
	});
};

module.exports = {
	APIs: APIs,
	APICall: function(msg, type, apikey, callback) {
		if (type in this.APIs)
			this.APIs[type](msg, apikey, callback)
		else {
			console.log("Unknown api");
		}
	}
}