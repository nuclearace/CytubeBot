CytubeBot
=========

Requires [node.js](http://nodejs.org/)

Add required info into config.json

run `npm install` then `node index.js`

Commands
--------
- `$anagram message` Anagrams a message
- `$talk message` Cleverbot talk bot
- `$mute/$unmute` Mutes/Unmutes the bot. Requires mod on the channel
- `$wolfram query` Requires a [WolframAlpha API key](http://products.wolframalpha.com/api/)
- `$processinfo` Shows basic node process memory usage
- `$quote [username]` Fetches a quote from the user given, otherwise fetches a random quote
- `$weather (US zip code | city/town country)` Looks up current conditions. Requires [WeatherUnderground API key](http://www.wunderground.com/weather/api/)
- `$forecast (US zip code | city/town country) [tomorrow]` Looks up forecast for that doy, or if tomorrow is given, the next day. [Requires WeatherUnderground API key](http://www.wunderground.com/weather/api/)
- `$status` Sends status ie. if the bot is muted
- `$addrandom [n]` Adds n random videos from database. Requires mod on channel
- `$blacklist` Blacklists currently playing video so that the bot doesn't add it randomly. Users can still add video. See $autodelete. Irreversible  without going into database.
- `$autodelete` Makes it so non-mods cannot add currently playing video. Irreversible without going into database.
- `$skip` Skips the current video. Requires mod on channel.
