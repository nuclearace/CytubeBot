import {Rank} from './constants.js';
import {errorLog} from './logger.js';

/** @typedef {import('./cytubebot.js').CytubeBot} CytubeBot */

/**
 * Adds the socket listeners.
 *
 * @param {CytubeBot} bot The bot.
 */
export function addHandlers(bot) {
  bot.socket.on('addUser', (data) => bot.handleAddUser(data));
  bot.socket.on('banlist', (data) => bot.handleBanlist(data));
  bot.socket.on('changeMedia', (data) => bot.handleChangeMedia(data));
  bot.socket.on('chatMsg', (data) => bot.handleChatMsg(data));
  bot.socket.on('delete', (data) => bot.handleDeleteMedia(data));
  bot.socket.on('disconnect', () => setTimeout(() => process.exit(0), 10 * 1000));
  bot.socket.on('emoteList', (emotes) => bot.channelEmotes = emotes);
  bot.socket.on('error', (err) => errorLog.log(err));
  bot.socket.on('login', (data) => bot.handleLogin(data));
  bot.socket.on('mediaUpdate', (data) => bot.handleMediaUpdate(data));
  bot.socket.on('moveVideo', (data) => bot.handleMoveMedia(data));
  bot.socket.on('needPassword', (data) => bot.handleNeedPassword(data));
  bot.socket.on('playlist', (data) => bot.handlePlaylist(data));
  bot.socket.on('channelOpts', (data) => bot.handleChannelOpts(data));

  bot.socket.on('pm', async (data) => {
    if (!(await bot.checkPermission(data.username, Rank.MOD, null))) {
      return;
    }
    bot.handleChatMsg(data, true);
  });

  bot.socket.on('queue', (data) => bot.handleAddMedia(data));
  bot.socket.on('removeEmote', (emote) => bot.handleRemoveEmote(emote));
  bot.socket.on('setCurrent', (data) => bot.handleSetCurrent(data));
  bot.socket.on('setLeader', (data) => bot.handleSetLeader(data));
  bot.socket.on('setTemp', (data) => bot.handleSetTemp(data));
  bot.socket.on('setUserMeta', (data) => bot.handleSetUserMeta(data));
  bot.socket.on('setUserRank', (data) => bot.handleSetUserRank(data));
  bot.socket.on('updateEmote', (data) => bot.handleEmoteUpdate(data));
  bot.socket.on('usercount', (data) => bot.storeUsercount(data));
  bot.socket.on('userLeave', (data) => bot.handleUserLeave(data.name));
  bot.socket.on('userlist', (data) => bot.handleUserlist(data));
}
