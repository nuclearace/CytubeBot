/**
 * Commands that primarily interact with external APIs.
 */

import translate from '@vitalets/google-translate-api';
import {DateTime} from 'luxon';

import {callAnagram, callWolfram, WEATHER_ABBREVIATION, weatherFromLocation, weatherFromZipCode} from '../apiclient.js';
import {Rank} from '../constants.js';
import {errorLog} from '../logger.js';
import {getRandomChat} from '../twitchlogs.js';

/** @typedef {import('./handle.js').Handler} Handler */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
export const COMMANDS = new Map();

COMMANDS.set('anagram', async (bot, username, msg) => {
  if ((new Date().getTime() - bot.timeSinceLastAnagram) / 1000 < 5) {
    return bot.sendPm(username, 'Anagram cooldown');
  }

  bot.timeSinceLastAnagram = new Date().getTime();
  if (msg.length < 7) {
    return bot.sendChatMsg('Message too short');
  } else if (msg.length > 30) {
    return bot.sendChatMsg('Message too long');
  }

  let /** @type {string} */ anagram;
  try {
    anagram = await callAnagram(msg);
  } catch (e) {
    errorLog.log(`Failed to get an anagram: ${e}`);
    bot.sendChatMsg('Failed to get an anagram');
    return;
  }

  bot.sendChatMsg(`[${msg}] -> ${anagram}`);
});

COMMANDS.set('cleverbot', async (bot, username, msg) => {
  if (bot.cleverbot === null) {
    bot.sendChatMsg('Cleverbot not configured');
    return;
  }

  if (!bot.cleverbotLimiter.tryRemoveTokens(1)) {
    bot.sendChatMsg('Out of Cleverbot quota for today FeelsBadMan');
    return;
  }

  const response =
      await new Promise((resolve, reject) => bot.cleverbot.write(msg, resolve, reject));
  if (response.error) {
    errorLog.log(`Cleverbot query failed: ${response.error}`);
    bot.sendChatMsg('Cleverbot query failed');
    return;
  }

  bot.sendChatMsg(response.output);
});

COMMANDS.set('islive', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!bot.twitch) {
    bot.sendChatMsg('Twitch API not configured FeelsBaddestMan');
    return;
  }

  const channel = msg.split(' ')[0];
  if (!channel) {
    bot.sendChatMsg('Channel must be provided. Example: $islive xqcow');
  }

  try {
    const isLive = await bot.twitch.isUserLive(channel);
    if (isLive === null) {
      bot.sendChatMsg(`Couldn't find channel ${channel}`);
      return;
    }

    if (isLive) {
      bot.sendChatMsg(`Yes, ${channel} is currently live.`);
    } else {
      bot.sendChatMsg(`No, ${channel} is not currently live.`);
    }
  } catch (err) {
    // bot.sendChatMsg(`[red]ERROR[/] ${err}`);
    return;
  }
});

COMMANDS.set('lasttweet', async (bot, username, msg) => {
  if (!bot.twitter) {
    bot.sendChatMsg('Twitter API not configured FeelsBaddestMan');
    return;
  }

  const target = msg.split(' ')[0];
  if (!target) {
    bot.sendChatMsg('Username must be provided, ex: $lasttweet xQc');
    return;
  }

  if (!bot.twitterLimiter.tryRemoveTokens(5)) {
    bot.sendChatMsg('Out of Twitter API quota, try again later');
    return;
  }

  /** @type {import('../twitter.js').UserV2|null} */
  let user;
  /** @type {import('../twitter.js').TweetV2|null} */
  let lastTweet;
  try {
    user = await bot.twitter.getUser(target);
    if (!user) {
      bot.sendChatMsg(`Couldn't find user`);
      return;
    }
    lastTweet = await bot.twitter.getLastTweet(user);
    if (!lastTweet) {
      bot.sendChatMsg(`Couldn't find the user's last tweet`);
      return;
    }
  } catch (err) {
    errorLog.log(err);
    bot.sendChatMsg(`Twitter API call failed`);
    return;
  }

  const words = lastTweet.text.split(' ');
  for (let w = 0; w < words.length; w++) {
    if (words[w].endsWith('do')) {
      for (let w = 0; w < words.length; w++) {
        if (words[w].startsWith('poof')) {
          bot.sendChatMsg(`Nice try forsenCD`);
          return;
        }
      }
    }
  }

  const timeSinceTweet = DateTime.fromISO(lastTweet.created_at).toRelative();

  bot.sendChatMsg(`[@${user.username}, ${timeSinceTweet}]: ${lastTweet.text}`);
});

COMMANDS.set('notifylive', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to notifylive. FeelsWeirdMan`);
    return;
  }
  if (!bot.twitch) {
    bot.sendChatMsg('Twitch API not configured FeelsBaddestMan');
    return;
  }

  const channelName = msg.split(' ')[0];
  if (!channelName) {
    bot.sendChatMsg('Channel name must be provided, ex: $notifylive xqcow');
    return;
  }

  const channel = await bot.twitch.getUser(channelName);
  if (!channel) {
    bot.sendChatMsg(`Couldn't find channel ${channelName}`);
    return;
  }

  await bot.db.setMonitorTwitchChannel(channel.id, channel.name, /* monitor= */ true);

  bot.monitoredTwitchChannels = await bot.db.getMonitoredTwitchChannels();

  const status = (await bot.twitch.isUserLive(channel.name)) ? 'live' : 'not live';
  bot.sendChatMsg(`Will now notify whenever ${channel.name} goes live. (currently ${status})`);
});

COMMANDS.set('notifylivelist', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to notifylive. FeelsWeirdMan`);
    return;
  }
  if (!bot.twitch) {
    bot.sendChatMsg('Twitch API not configured FeelsBaddestMan');
    return;
  }
  if (bot.monitoredTwitchChannels.length === 0) {
    bot.sendChatMsg('No Twitch channels will notify chat when they go live');
    return;
  }

  bot.sendChatMsg(
      'Channels that will notify chat when they go live: ' +
      bot.monitoredTwitchChannels.map((channel) => channel.name).join(', '));
});

COMMANDS.set('randomchat', async (bot, username, msg) => {
  const [channel, user] = msg.split(' ');
  if (!channel) {
    bot.sendChatMsg('Channel must be provided, ex: $randomchat xqcow somechatter');
    return;
  }
  if (!user) {
    bot.sendChatMsg('User must be provided, ex: $randomchat xqcow somechatter');
    return;
  }

  let chat;
  try {
    chat = await getRandomChat(channel, user);
  } catch (err) {
    if (err.toString().includes('User or channel has opted out')) {
      bot.sendChatMsg('User or channel has opted out');
      return;
    }
    errorLog.log(err);
    bot.sendChatMsg('TwitchLogs API call failed (does user/channel exist?)');
    return;
  }

  const timeSinceChat = DateTime.fromISO(chat.timestamp).toRelative();

  bot.sendChatMsg(`[${chat.channel}/${chat.displayName}, ${timeSinceChat}]: ${chat.text}`);
});


COMMANDS.set('translate', async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  const langMatches = msg.split(' ')[0].match(/(\w{2})(?:\-?\>)?(\w{2})?/i);
  if (!langMatches) {
    bot.sendChatMsg(`Couldn't parse languages. Ex: $translate en->es mountain`);
    return;
  }

  const from = langMatches[2] ? langMatches[1] : undefined;
  const to = langMatches[2] || langMatches[1];
  const text = msg.split(' ').slice(1).join(' ');

  try {
    const response = await translate(text, {from, to});
    bot.sendChatMsg(`[${response.from.language.iso}->${to}] ${response.text}`);
  } catch (err) {
    errorLog.log(err);
    bot.sendChatMsg('Google Translate API call failed');
  }
});

COMMANDS.set('userlogs', async (bot, username, msg) => {
  const channel = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : 'xqcow';
  if (msg.split(' ')[1] == null) {
    bot.sendChatMsg(`${username}'s logs in ${channel}'s channel: https://logs.ivr.fi/?channel=${
        channel}&username=${username}`);
  } else {
    const user = msg.split(' ')[1];
    bot.sendChatMsg(`${user}'s logs in ${channel}'s channel: https://logs.ivr.fi/?channel=${
        channel}&username=${user}`);
  }
});

COMMANDS.set('weather', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!bot.openWeatherApiKey) {
    return bot.sendChatMsg('OpenWeather API not configured FeelsBaddestMan');
  }

  if (!bot.weatherLimiter.tryRemoveTokens(1)) {
    bot.sendChatMsg('Out of weather API quota, try again later.');
    return;
  }

  const location = msg.trim();

  let data;
  try {
    let /** @type {import('@cicciosgamino/openweather-apis').AsyncWeather} */ weather;
    if (/^\d+$/.test(location)) {
      // Contains only digits. Probably a zip code.
      weather = await weatherFromZipCode(location, bot.openWeatherApiKey);
    } else {
      // Assume they've provided city
      weather = await weatherFromLocation(location, bot.openWeatherApiKey);
    }
    data = await weather.getAllWeather();
  } catch (err) {
    errorLog.log(err);
    bot.sendChatMsg(
        'Weather API call failed. If you typed a location, try the format "city,county,country"');
    return;
  }

  const temp = Math.floor(data.main.temp);
  const title = data.weather[0].main;
  const city = data.name;
  const country = data.sys.country;

  bot.sendChatMsg(`[${city}, ${country}]: ${temp}°${WEATHER_ABBREVIATION}, ${title}`);
});

COMMANDS.set('wolfram', async (bot, username, msg) => {
  if (!bot.wolframApiKey) {
    bot.sendChatMsg('No Wolfram API key in config!');
    return;
  }

  if (bot.wolframLimiter.getTokensRemaining() < 1) {
    bot.sendChatMsg('Wolfram query allowance used up for the day');
    return;
  }

  if (!msg) {
    bot.sendChatMsg('Query must be provided, ex: $wolfram distance to the moon');
    return;
  }

  let /** @type {string} */ response;
  try {
    response = await callWolfram(msg, bot.wolframApiKey);
    bot.sendChatMsg(response);
  } catch (e) {
    errorLog.log(`Wolfram call failed: ${e}`);
    bot.sendChatMsg(e);
  }
});
