# CytubeBot

## Install

1. Install [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
1. Install [node.js](http://nodejs.org/) (Last tested on v17.2.0)
1. Run `git clone https://github.com/airforce270/CytubeBot`
   - This will create a directory named `CytubeBot` containing the bot code.
     Keep this in mind when running the command.
1. Run `cd CytubeBot`
1. Run `npm install`
1. Make a copy of `config.SAMPLE.json` named `config.json` and update the config values to what you need.
   See [config section](#config).
1. Run `npm run start`

Notes:
If you receive errors related to libxmljs, you need to install GCC and run `npm install` again.
Getting it to work on Windows is a pain, so your best bet is to run it on Linux or OS X.

### Update

To update the bot, simply run `npm install` then `git pull`

### Developing

[clang-format](https://clang.llvm.org/docs/ClangFormat.html) is used for formatting.
It's recommended to enable "format on save" in the IDE of your choice.

[ESLint](https://eslint.org/) is used for linting. Any issues it finds should be fixed.

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
- `twitchClientId` - Twitch API client ID.
  See [Twitch API docs](https://dev.twitch.tv/docs/api/).
- `twitchClientSecret` - Twitch API client secret.
  See [Twitch API docs](https://dev.twitch.tv/docs/api/).
- `deleteIfBlockedIn` [optional] - If given youtubev3 and you would like to delete videos
  blocked in a specific country, put the 2 letter country code of it here.
- `enableWebServer` - Turns on/off the webserver.
- `webURL` [optional] - The domain/ip you would use to connect to the webserver example:
  `http://google.com` or `http://192.76.32.222`.
- `webPort` [optional] - The port for the webserver. Anything below 1000 requires root.
- `socketPort` [optional] - The port for socketIO. Anything below 1000 requires root.
- `usemodflair` - Whether to use modflair or not.
- `enableLogging` - Whether to write log data to a file.
- `maxvideolength` - Maximum length of videos to select from database.
- `cleverbotioUser` - API User for cleverbot.io. See [Cleverbot docs](https://cleverbot.io/).
- `cleverbotioKey` - API Key for cleverbot.io. See [Cleverbot docs](https://cleverbot.io/).

## Commands

Can be run by anyone:

- `$cock` - Tells you your size.
- `$iq` - Tells you your IQ.
- `$tuck (user)` - Tuck someone in :)
- `$gn` - Have the bot wish you a good night :)
- `$ping` - Pings you.
- `$rngping` - Pings a random user.
- `$p [user]` - Tells you how many points you or another user have.
  `$points` and `$userpoints` also work.
- `$givepoints (user) (points)` - Give away some of your points to another user.
- `$roulette (points|n%|all)` - Roulette some points!
- `$smp (points|n%|all)` - Do a slot machine pull for some points!
- `$raffle (points|n%|all)` - Raffle some points! Other users can type `$join` to join the raffle,
  and points will be given to a random winner!
- `$leaderboard [page]` - Show a leaderboard of the current top point holders.
- `$rank [user]` - Shows your rank (or another user's rank) on the leaderboard.
- `$choose [option1] [option2] {...}` - Chooses one of several options randomly.
- `$pyramid [emote]` - Makes a 4-height pyramid with an emote.
- `$blacklistedusers` - Lists the blacklisted users.
- `$blockedusers` - Lists the blocked users.
- `$listpermissions [username]` - Lists the hybrid mod permissions for a user.
  Omitting username shows calling users permissions.
- `$quote [username]` - Fetches a quote from the user given, otherwise fetches a random quote.
- `$processinfo` - Shows basic node process memory usage.
- `$status` - Sends status ie. if the bot is muted.
- `$emotecount [user] (emote)` - Shows how many times an emote has been used.
  If a user is provided, it will show how many times that user has used that emote.
  `$ecount` works as well.
- `$userstats [user]` - Sends some stats about a user, or you.
- `$cleverbot message` - Cleverbot talk bot. Required a [paid API plan](https://www.cleverbot.com/api/).
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

Requires rank/permission:

- `$mute/$unmute` - Mutes/Unmutes the bot. Requires mod on the channel or "M" permission.
- `$clearchat` - Clears chat. Requires mod or "M" permission.
- `$poll title.option1.option2.etc.[true]` - Opens a poll, use . to seperate options.
  The last option, if "true", makes it an obscured poll (votes are hidden to non-mods).
  Requires mod or "P" permission.
- `$endpoll` - Ends a poll. Requires mod or "P" permission.
- `$addpoints (username) (points)` - Adds points to a given user.
  Requires mod permission.
- `$removepoints (username) (points|all)` - Removes points from a given user.
  Requires mod permission.
- `$module (module) (on|off)` - Enable or disable a module. Requires mod permission.
- `$moduleson` - Enable all modules. Requires mod permission.
- `$modulesoff` - Disable all modules. Requires mod permission.
- `$notifylive (channel)` - Notify chat when a Twitch channel goes live.
- `$nonotifylive (channel)` - Stop notifying chat when a Twitch channel goes live.
- `$notifylivelist (channel)` - Lists which channels will notify chat when they go live.
- `$timeout (username) (duration)` - Times out (mutes) a user for some period of time.
  Examples: `$timeout user5 10s`, `$timeout user5 3d`, `$timeout user5 1h 30m`
  Requires mod permission.
- `$rngtimeout (duration)` - Times out a random user for some period of time.
  Requires mod permission.
- `$timeouts` - Lists the currently timed out users and how long they're timed out for.
  Requires mod permission.
- `$kick (username) [reason]` - Kicks user. Requires mod or kick permission.
- `$rngkick` - Kicks a random user. Requires mod or kick permission.
- `$tempban (username) (duration)` - Bans a user for some period of time.
  Examples: `$tempban user5 10s`, `$tempban user5 3d`, `$tempban user5 1h 30m`
  Will auto-kick them again if they try to join again before the time's up.
  Requires mod or kick permission.
- `$rngtempban (duration)` - Bans a random user for some period of time.
  Requires mod or kick permission.
- `$tempbans` - Lists the currently tempbanned users and how long they're banned for.
- `$ban (username) [reason]` - Namebans user. Requires mod or ban permission.
- `$ipban (username) [reason]` - IPbans user. Requires mod or ban permission.
- `$unban (username)` - Unbans user. Works for temp banned users. Requires mod or ban permission.
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
  See [permissions](#permissions).
- `$restart` - Restart the bot. Requires leader or 'K' permission.
- `$update` - Updates the bot using `git pull`. Requires leader or 'K' permission.
- `$logs (error|cytubebot|sys) (last|first) (n)` - PMs you the bot logs. Requires leader or 'K' permission.
- `$resetrestartcount` - Resets the restart count to 0. Requires leader or 'K' permission.
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
- `$add URL [next]` - Adds link, requires mod because of potential for media limit abuse.
- `$shuffle` - Shuffles the playlist. Requries mod or permission
- `$settime time` - Sets the time on the video to time. Whereas time is in seconds.
  Requires mod or "T" permission.
- `$spam [n] message` - Spams a message several times. Requires mod or higher.

## Permissions

| Code | Usage                    |
|------|--------------------------|
| `A`  | Add ($add)               |
| `D`  | Delete ($delete)         |
| `G`  | Management ($management) |
| `I`  | Kick ($kick)             |
| `K`  | Restart ($restart)       |
| `L`  | Userlimit ($userlimit)   |
| `M`  | Mute ($mute/$unmute)     |
| `N`  | Ban ($ban)               |
| `P`  | Poll ($poll)             |
| `R`  | Add random ($addrandom)  |
| `S`  | Skip ($skip)             |
| `T`  | Set Time ($settime)      |
| `U`  | Shuffle ($shuffle)       |

## Custom Commands

You can add custom commands inside custom.js, this will help you avoid merge conflicts
when the bot is updated.
