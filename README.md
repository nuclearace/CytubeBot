# CytubeBot

## Install

1. Install [node.js](http://nodejs.org/) (Last tested on v17.2.0)
2. Either use `git clone https://github.com/airforce270/CytubeBot` or download the zip file.
(git is better since it allows easier updates via `git pull`)
3. cd into the CytubeBot directory and run `npm install`.
4. Copy `config.SAMPLE.json` to `config.json` and update the config values to what you need.
   See config section.
5. Run `node index.js`.

Notes:
If you receive errors related to libxmljs, you need to install GCC and run `npm install` again.
Getting it to work on Windows is a pain, so your best bet is to run it on Linux or OS X.

### Developing

[clang-format](https://) is used for formatting. It's recommended to enable "format on save"
in the IDE of your choice.

ESLint is used for linting.

## Config

- `cytubeServer` - URL of the server. Ex "https://cytu.be".
- `username` - Account name the bot uses on the Cytube server.
- `pw` [optional] - Password for the bot, blank logs in as guest.
- `room` - Room the bot should join.
- `roompassword` [optional] - Room password, if there is one.
- `wolfram` [optional] - WolframAlpha API key.
  See [WolframAlpha docs](http://products.wolframalpha.com/api/)
- `weatherunderground` [optional] - WeatherUnderground API key.
  See [Wunderground docs](http://www.wunderground.com/weather/api/)
- `youtubev3` [optional] - YouTube API v3 API key.
  See [YouTube docs](https://developers.google.com/youtube/v3/).
- `deleteIfBlockedIn` [optional] - If given youtubev3 and you would like to delete videos
  blocked in a specific country, put the 2 letter country code of it here.
- `enableWebServer` - Turns on/off the webserver.
- `webURL` [optional] - The domain/ip you would use to connect to the webserver example:
  `http://google.com` or `http://192.76.32.222`.
- `webPort` [optional] - The port for the webserver. Anything below 1000 requires root.
- `socketPort` [optional] - The port for socketIO. Anything below 1000 requires root.
- `useIRC` - Whether or not to bridge to IRC. Note: All commands that require rank will not work.
- `ircServer` [optional] - the IRC server address. ex: "irc.6irc.net".
- `ircNick` [optional] - The nickname of the bot on irc.
- `ircPass` [optional] - Password for the IRC nick (If needed).
- `ircChannel` [optional] - The channel the bot should join. ex: "#testing"
- `usemodflair` - Whether to use modflair or not.
- `enableLogging` - Whether to write log data to a file.
- `maxvideolength` - Maximum length of videos to select from database.
- `cleverbotioUser` - API User for cleverbot.io. See [Cleverbot docs](https://cleverbot.io/).
- `cleverbotioKey` - API Key for cleverbot.io. See [Cleverbot docs](https://cleverbot.io/).

## Commands

Require rank/permission:

- `$mute/$unmute` - Mutes/Unmutes the bot. Requires mod on the channel or "M" permission.
- `$clearchat` - Clears chat. Requires mod or "M" permission.
- `$poll title.option1.option2.etc.[true]` - Opens a poll, use . to seperate options.
  The last option, if "true", makes it an obscured poll (votes are hidden to non-mods).
  Requires mod or "P" permission.
- `$endpoll` - Ends a poll. Requires mod or "P" permission.
- `$kick (username) [reason]` - Kicks user. Requires mod or kick permission.
- `$ban (username) [reason]` - Namebans user. Requires mod or ban permission.
- `$ipban (username) [reason]` - IPbans user. Requires mod or ban permission.
- `$unban (username)` - Unbans user. Requires mod or ban permission.
- `$blacklistuser (username) (true|false)` - Makes it so this users videos are not randomly added
  if the bot is leading.
- `$blockuser (username) [true|false]` - Stops username from adding videos. Requires mod or higher.
- `$allow (username)` - Makes it so `user` can use the bot. Requires mod or "M" permission.
  Note - This command is case-sensitive.
- `$disallow (username)` - Makes it so `user` cannot use the bot. Requires mod or "M" permission.
  Note - This command is case-sensitive.
- `$permissions []` - example: `$permissions +x bob` gives permission x to bob.
  To take away use `$permissions -x bob`. To give or take away all permissions.
  do `$permissions +all bob`/`$permissions -all bob`.
  See [permissions page](https://github.com/airforce270/CytubeBot/wiki/Permissions).
- `$userlimit (true|false) | n` - Limits the number of videos users can add. Mods are not exempt.
  Ex: `$userlimit true 5`.
- `$addrandom [n]` - Adds n random videos from database. Requires mod on channel or "R" permission.
- `$blacklist` - Blacklists currently playing video so that the bot doesn't add it randomly.
  Users can still add video. See $autodelete. Irreversible without going into database.
  Requires mod or higher.
- `$autodelete` - Makes it so non-mods cannot add currently playing video.
  Irreversible without going into database. Requires mod or higher.
- `$skip` - Skips the current video. Requires mod on channel or "S" permission.
- `$delete (username) [all | n]` - Deletes all or n videos added by username.
  Deletes the videos from the botton up. Leaving out all or n deletes the last video.
  Requires mod on channel or "D" permission
- `$purge (username)` - Deletes all videos added by username. Requires mod on channel or "D" permission
- `$bump -(user|title) (username | title to be matched) [all|n]` - Bumps all or n videos by username,
  or bumps videos matching the given title. Ex: `$bump -title the dog 2` -
  Will bump the last two videos matching `.*the dog.*`.
- `$add URL [next]` -  Adds link, requires mod because of potential for media limit abuse.
- `$shuffle` - Shuffles the playlist. Requries mod or permission
- `$settime time` - Sets the time on the video to time. Whereas time is in seconds.
  Requires mod or "T" permission.
- `$spam [n] message` - Spams a message several times. Requires mod or higher.

Don't require rank/permission:

- `$cock` - Tells you your size.
- `$choose [option1] [option2] {...}` - Chooses one of several options randomly.
- `$pyramid [emote]` - Makes a 4-height pyramid with an emote.
- `$blacklistedusers` - Lists the blacklisted users.
- `$blockedusers` - Lists the blocked users.
- `$listpermissions [username]` - Lists the hybrid mod permissions for a user.
  Omitting username shows calling users permissions.
- `$quote [username]` - Fetches a quote from the user given, otherwise fetches a random quote.
- `$processinfo` - Shows basic node process memory usage.
- `$status` - Sends status ie. if the bot is muted.
- `$talk message` - Cleverbot talk bot.
- `$wolfram query` - Makes a query to Wolfram.
  Requires a [WolframAlpha API key](http://products.wolframalpha.com/api/).
- `$weather (US zip code | city/town country)` - Looks up current conditions.
  Requires [WeatherUnderground API key](http://www.wunderground.com/weather/api/).
- `$forecast (US zip code | city/town country) [tomorrow]` - Looks up forecast for that day,
  or if tomorrow is given, the next day.
  Requires [WeatherUnderground API key](http://www.wunderground.com/weather/api/).
- `$choose (choice1 choice2...)` - Chooses a random item from the choices given.
- `$translate [[bb] | [aa>bb] | [aa->bb]] string` -
    Translates the given string from aa, which defaults to detecting the language,
    to bb, which defaults to en, using Google Translate.
    The languages aa and bb must be specified as an ISO two letter language code.

## Custom Commands

You can add custom commands inside custom.js, this will help you avoid merge conflicts
when the bot is updated.
