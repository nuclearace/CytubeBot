/**
 * Debug/admin commands.
 */

import {exec} from 'child_process';
import {writeFile} from 'fs/promises';
import {promisify} from 'util';

import {Rank, RESTART_TIMES_FILE_NAME} from '../constants.js';
import {auditLog, errorLog, infoLog, monitorErrorLog} from '../logger.js';
import {kill, sendMessagesWithRateLimit, sendPmsWithRateLimit} from '../utils.js';

const execAsync = promisify(exec);

/** @typedef {import('./handle.js').Handler} Handler */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
export const COMMANDS = new Map();

COMMANDS.set('debugchat', async (bot, username, msg) => {
  if (username !== 'airforce2700') {
    bot.sendChatMsg('Only bot guy can run that Okayeg');
    return;
  }

  let rows;
  try {
    rows = await bot.db.dumpForDebug(msg);
  } catch (err) {
    errorLog.log(err);
    bot.sendChatMsg('Dump failed');
    return;
  }
  if (!rows || rows.length === 0) {
    bot.sendChatMsg('No data returned');
    return;
  }

  await sendMessagesWithRateLimit(bot, rows.map((row) => JSON.stringify(row)));
});

COMMANDS.set('debugpm', async (bot, username, msg) => {
  if (username !== 'airforce2700') {
    bot.sendChatMsg('Only bot guy can run that Okayeg');
    return;
  }

  let rows;
  try {
    rows = await bot.db.dumpForDebug(msg);
  } catch (err) {
    errorLog.log(err);
    bot.sendPm(username, 'Dump failed');
    return;
  }
  if (!rows || rows.length === 0) {
    bot.sendPm(username, 'No data returned');
    return;
  }

  await sendPmsWithRateLimit(bot, username, rows.map((row) => JSON.stringify(row)));
});

COMMANDS.set('internals', (bot, username, msg) => {
  if (!bot.enableWebServer) {
    return bot.sendChatMsg('WebServer not enabled');
  }

  bot.sendChatMsg(`${bot.webURL}:${bot.webPort}/internals`);
});

COMMANDS.set('logs', async (bot, username, msg) => {
  if (!msg) {
    return;
  }
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'K'))) {
    bot.sendPm(username, `You do not have permission to logs. FeelsWeirdMan`);
    return;
  }

  const logFileAudit = 'audit';
  const logFileError = 'error';
  const logFileInfo = 'info';
  const logFileMonitorError = 'monitor_error';
  const logFiles = [logFileAudit, logFileError, logFileInfo, logFileMonitorError];

  const fileName = msg.split(' ')[0];
  if (fileName === '') {
    bot.sendPm(username, `Name of log must be provided. Example: $logs error first 5`);
    return;
  }
  if (!logFiles.includes(fileName)) {
    bot.sendPm(
        username, `Name of log must be one of the following: ${logFiles}. Provided: ${fileName}`);
    return;
  }

  const direction = msg.split(' ')[1];
  if (direction === '') {
    bot.sendPm(username, `Direction to search must be provided. Example: $logs error last 10`);
    return;
  }
  const forward = direction === 'first';

  const numberOfLinesMsg = msg.split(' ')[2];
  if (numberOfLinesMsg === '') {
    bot.sendPm(username, `Number of lines must be provided. Example: $logs error last 10`);
    return;
  }
  const numberOfLines = parseInt(numberOfLinesMsg, 10);
  if (isNaN(numberOfLines)) {
    bot.sendPm(username, `Failed to parse number of lines. Example: $logs error last 10`);
    return;
  }

  const lines = [];
  if (fileName === logFileAudit) {
    const data =
        forward ? await auditLog.read(numberOfLines) : await auditLog.readReverse(numberOfLines);
    lines.push(...data);
  } else if (fileName === logFileError) {
    const data =
        forward ? await errorLog.read(numberOfLines) : await errorLog.readReverse(numberOfLines);
    lines.push(...data);
  } else if (fileName === logFileInfo) {
    const data =
        forward ? await infoLog.read(numberOfLines) : await infoLog.readReverse(numberOfLines);
    lines.push(...data);
  } else if (fileName === logFileMonitorError) {
    const data = forward ? await monitorErrorLog.read(numberOfLines) :
                           await monitorErrorLog.readReverse(numberOfLines);
    lines.push(...data);
  } else {
    bot.sendPm(
        username,
        'Log file name didn\'t match any options. ' +
            'This should never happen.');
  }

  sendPmsWithRateLimit(bot, username, lines);
});

COMMANDS.set('management', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'G'))) {
    bot.sendChatMsg(`${username} does not have permission to management. FeelsWeirdMan`);
    return;
  }

  if (msg.indexOf('on') !== -1) {
    auditLog.log('!~~~! Bot is now managing the playlist');
    bot.stats.managing = true;
    bot.writePersistentSettings();
  } else if (msg.indexOf('off') !== -1) {
    auditLog.log('!~~~! The bot is no longer managing the playlist');
    bot.stats.managing = false;
    bot.writePersistentSettings();
  }

  if (bot.playlist.length === 0 && bot.stats.managing) {
    bot.addRandomVideos();
  }
});

COMMANDS.set('playlistdebug', (bot, username, msg) => {
  if (msg) {
    return console.log(bot.playlist[msg]);
  }

  console.log(bot.playlist);
});

COMMANDS.set('processinfo', (bot) => {
  const info = process.memoryUsage();
  bot.sendChatMsg(`Heap total: ${info.heapTotal} Heap used: ${info.heapUsed}`);
});

COMMANDS.set('resetrestartcount', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.ADMIN, 'K'))) {
    bot.sendChatMsg(
        `${username} does not have permission to resetrestartcount. ` +
        'FeelsWeirdMan');
    return;
  }

  try {
    await writeFile(RESTART_TIMES_FILE_NAME, '0');
  } catch (e) {
    errorLog.log(e);
    bot.sendChatMsg(`Failed to reset restart count.`);
    return;
  }

  bot.sendChatMsg(`Restart count is now ${await bot.readTimes()}.`);
});

COMMANDS.set('restart', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, 'K'))) {
    bot.sendChatMsg(`${username} does not have permission to restart. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('Restarting, please wait...');
  kill();
});

COMMANDS.set('update', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.FOUNDER, 'K'))) {
    bot.sendChatMsg(`${username} does not have permission to update. FeelsWeirdMan`);
    return;
  }

  bot.sendChatMsg('Updating...');

  let /** @type {string} */ stdout;
  try {
    const result = await execAsync('npm install');
    if (result.stderr) {
      errorLog.log(`error running npm install: ${result.stderr}`);
      bot.sendChatMsg('Update failed, please check logs.');
      return;
    }
    stdout = result.stdout;
  } catch (e) {
    errorLog.log(`error running npm install: ${e}`);
    bot.sendChatMsg('Update failed, please check logs.');
    return;
  }

  infoLog.log(`Results of running npm install: ${stdout}`);

  try {
    const result = await execAsync('git pull');
    if (result.stderr) {
      errorLog.log(`error running git pull: ${result.stderr}`);
      bot.sendChatMsg('Update failed, please check logs.');
      return;
    }
    stdout = result.stdout;
  } catch (e) {
    errorLog.log(`error running git pull: ${e}`);
    bot.sendChatMsg('Update failed, please check logs.');
    return;
  }

  infoLog.log(`Results of running git pull: ${stdout}`);

  if (stdout === 'Already up to date.\n') {
    bot.sendChatMsg('Already up-to-date. FeelsOkayMan :+1:');
    return;
  }

  bot.sendChatMsg('Restarting, please wait...');
  kill(/* afterMs= */ 2000);
});
