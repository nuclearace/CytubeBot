/**
 * Chat stats commands.
 */

import {filterMsg} from '../utils.js';

/** @typedef {import('./handle.js').Handler} Handler */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
export const COMMANDS = new Map();

COMMANDS.set('chatleaderboard', async (bot, username, msg) => {
  const pageSize = 5;
  const pageMsg = msg.split(' ')[0];
  const pageMsgParsed = pageMsg !== '' ? parseInt(pageMsg, 10) : 1;
  const pageNumber = !isNaN(pageMsgParsed) ? pageMsgParsed : 1;
  const firstRank = ((pageNumber - 1) * pageSize) + 1;
  if (pageNumber > 10000) {
    bot.sendChatMsg(`Nice try forsenCD`);
    return;
  }
  if (pageNumber < 0) {
    bot.sendChatMsg(`The page number needs to be a positive number Pepega Clap`);
    return;
  }

  const page = await bot.db.getChatLeaderboardPage(bot.room, pageNumber - 1, pageSize);
  const start = firstRank;
  const end = firstRank + page.length - 1;

  const pmIfUserCountGreaterThan = 50;

  const deliver = bot.userlist.length > pmIfUserCountGreaterThan ?
      (msg) => bot.sendPm(username, msg) :
      (msg) => bot.sendChatMsg(msg);

  if (bot.userlist.length > pmIfUserCountGreaterThan) {
    if (bot.leaderboardLargeChatLimiter.tryRemoveTokens(1)) {
      bot.sendChatMsg(`PMing leaderboard due to high # of users in chat`);
    }
  }

  deliver(`Chat leaderboard ${start}-${end}:`);

  for (const [i, user] of page.entries()) {
    const rank = i + firstRank;
    deliver(`#${rank} ${user.chats} chats: ${user.name}`);
  }

  if (page.length === pageSize) {
    deliver(`For the next page, do $chatleaderboard ${pageNumber + 1}`);
  }
});

COMMANDS.set('chatrank', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;

  let rank = 1;
  let chats = -1;

  let pageNumber = 0;
  const pageSize = 100;
  pageLoop: while (true) {
    const page = await bot.db.getChatLeaderboardPage(bot.room, pageNumber, pageSize);
    for (const user of page) {
      if (user.name === target) {
        chats = user.chats;
        break pageLoop;
      }
      rank++;
    }

    if (page.length < pageSize) {
      bot.sendChatMsg(`Couldn't find ${target}'s rank`);
      return;
    }

    pageNumber++;
  }

  bot.sendChatMsg(`${target} is rank ${rank} on the chat leaderboard with ${chats} chats`);
});

COMMANDS.set('chats', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;

  let rank = 1;
  let chats = -1;

  let pageNumber = 0;
  const pageSize = 100;
  pageLoop: while (true) {
    const page = await bot.db.getChatLeaderboardPage(bot.room, pageNumber, pageSize);
    for (const user of page) {
      if (user.name === target) {
        chats = user.chats;
        break pageLoop;
      }
      rank++;
    }

    if (page.length < pageSize) {
      bot.sendChatMsg(`Couldn't find ${target}'s rank`);
      return;
    }

    pageNumber++;
  }

  bot.sendChatMsg(`${target} has sent ${chats} chats (rank ${rank})`);
});

COMMANDS.set('stats', async (bot, username, msg) => {
  const stats = await bot.db.getGeneralStats();
  if (stats) {
    bot.sendChatMsg(
        `Videos: ${stats.videoCount}, ` +
        `Users: ${stats.userCount}, ` +
        `Chats: ${stats.chatCount}`);
  }

  if (bot.enableWebServer) {
    bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/`);
  }
});

COMMANDS.set('status', (bot, username, msg) => {
  if ((new Date().getTime() - bot.timeSinceLastStatus) / 1000 < 120) {
    return bot.sendPm(username, 'Status cooldown');
  }

  bot.timeSinceLastStatus = new Date().getTime();

  bot.sendChatMsg(
      `[Muted: ${bot.stats.muted}; ` +
      `Managing playlist: ${bot.stats.managing}; ` +
      `Userlimit: ${bot.stats.userLimit}; ` +
      `Userlimit Number: ${bot.stats.userLimitNum}]`);
});

COMMANDS.set('userstats', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;
  const chatCount = await bot.db.getUserStats(target);
  const quote = filterMsg((await bot.db.getQuote(target)).msg);
  bot.sendChatMsg(`${target} has sent ${chatCount} messages, random quote: ${quote}`);
});
