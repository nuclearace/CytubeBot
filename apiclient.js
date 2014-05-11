var http = require("http")
var https = require("https")
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
			})
		})
	},

	"youtubelookup": function(id, apiKey, callback) {
		console.log("!~~~! Looking up youtube info for: " + id)
		var params = [
			"part=" + "id,snippet,contentDetails,status",
			"id=" + id,
			"key=" + apiKey
		].join("&")

		var options = {
			host: "www.googleapis.com",
			port: 443,
			path: "/youtube/v3/videos?" + params,
			method: "GET",
			dataType: "jsonp",
			timeout: 1000
		}

		urlRetrieve(https, options, function(status, data) {
			if (status !== 200) {
				callback(status, null)
				return
			}

			data = JSON.parse(data)
			console.log(data["items"][0]["contentDetails"])
			if (data.pageInfo.totalResults !== 1) {
				callback("Video not found", null)
				return
			}

			var vidInfo = {
				id: data["items"][0]["id"],
				contentDetails: data["items"][0]["contentDetails"],
				status: data["items"][0]["status"]
			}

			callback(true, vidInfo)
		})
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