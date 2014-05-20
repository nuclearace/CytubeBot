CytubeBot
=========

Install
-------
1. Install [node.js](http://nodejs.org/)
2. Either use `git clone https://github.com/nuclearace/CytubeBot` if you have git or download the zip file. (git is better since it allows easier updates via `git pull`
3. cd into the CytubeBot directory and run `npm install`
4. Add required info into config.json. See config section.
5. run `node index.js`

You can make it persistant with `screen node index.js`. To have it restart should it crash make run.sh executable and do `[screen] sh run.sh`

Config
------
- `serverio` - socketIO url, you can find the server IO port by typing http://nameofcytubeserver.com/sioconfig and copying the IO_URL.
- `username` - Name of the bot
- `pw` [optional] - Password for the bot, blank logs in as guest
- `room` - Room password if there is one
- `wolfram` [optional] - WolframAlpha apikey. See http://products.wolframalpha.com/api/
- `weatherunderground` [optional] - WeatherUnderground apikey. see http://www.wunderground.com/weather/api/
- `mstranslateclient` [optional] - Microsoft client name. See http://www.microsofttranslator.com/dev/ and http://msdn.microsoft.com/en-us/library/hh454950.aspx 
- `mstranslatesecret` [optional] - Microsoft secret key
- `youtubev3` [optional] - Youtubev3 api key. See https://developers.google.com/youtube/v3/
- `deleteIfBlockedIn` [optional] - If given youtubev3 and you would like to delete videos blocked in a specific country, put the 2 letter country code of it here
- `enableWebServer` - Turns on/off the webserver
- `webURL` - The domain/ip you would use to connect to the webserver example: http://google.com or http://192.76.32.222
- `webPort` - The port for the webserver. Anything below 1000 requires root.
- `socketPort` - The port for socketIO. Anything below 1000 requires root.
- `useIRC` - Whether or not to bridge to IRC. Note: All mods on the cytube channel should be registered with nickserv on IRC to avoid someone from using their name to have the bot execute commands.
- `ircServer` - the IRC server address. ex: "irc.6irc.net"
- `ircNick` - The nickname of the bot on irc.
- `ircPass` - Password for the IRC nick (If needed).
- `ircChannel` - The channel the bot should join. ex: "#testing"
- `usemodflair` - whether to use modflair or not.


Commands
--------
- `$anagram message` Anagrams a message
- `$talk message` Cleverbot talk bot
- `$mute/$unmute` Mutes/Unmutes the bot. Requires mod on the channel or "M" permission.
- `$wolfram query` Requires a [WolframAlpha API key](http://products.wolframalpha.com/api/)
- `$processinfo` Shows basic node process memory usage
- `$quote [username]` Fetches a quote from the user given, otherwise fetches a random quote
- `$weather (US zip code | city/town country)` Looks up current conditions. Requires [WeatherUnderground API key](http://www.wunderground.com/weather/api/)
- `$forecast (US zip code | city/town country) [tomorrow]` Looks up forecast for that day, or if tomorrow is given, the next day. [Requires WeatherUnderground API key](http://www.wunderground.com/weather/api/)
- `$status` Sends status ie. if the bot is muted
- `$addrandom [n]` Adds n random videos from database. Requires mod on channel or "R" permission.
- `$blacklist` Blacklists currently playing video so that the bot doesn't add it randomly. Users can still add video. See $autodelete. Irreversible  without going into database. Requires admin on the channel.
- `$autodelete` Makes it so non-mods cannot add currently playing video. Irreversible without going into database. Requires owner on channel.
- `$skip` Skips the current video. Requires mod on channel or "S" permission.
- `$delete username [all | n]` Deletes all or n videos added by username. Deletes the videos from the botton up. Leaving out all or n deletes the last video. Requires mod on channel or "D" permission
- `$bump -(user|title) (username| title to be matched) [all|n]` Bumps all or n videos by username, or bumps videos matching the given title. Ex: `$bump -title the dog 2` Will bump the last two videos matching `.*the dog.*`.
- `$add link` Adds link, requires mod because of potential for media limit abuse.
- `$choose (choice1 choice2...)` Chooses a random item from the choices given.
- `$translate [[bb] | [aa>bb] | [aa->bb]] string`
    Translates the given string from aa, which defaults to detecting the language, to bb, which defaults to en, using Microsoft Translate.
    The languages aa and bb must be specified as an ISO two letter language code. Requires Microsoft Translate api. See http://www.microsofttranslator.com/dev/ and http://msdn.microsoft.com/en-us/library/hh454950.aspx
- `$permissions` example: `$permissions +x bob` gives permission x to bob. To take away use `$permissions -x bob`. To list permissions just do `$permissions bob`. To give or take away all permissions do `$permissions +all bob`/`$permissions -all bob`. See https://github.com/nuclearace/CytubeBot/wiki/Permissions
- `$poll the name of the poll.option1. option 2.etc.[true]` - Opens a poll, use . to seperate options. The last option, if "true", makes it an obscured poll (votes are hidden to non-mods). Requires mod or "P" permission
- `$endpoll` - Ends a poll. Requires mod or "P" permission


Custom Commands
---------------
You can add custom commands inside custom.js, this will help you avoid merge conflicts when I update the bot.
