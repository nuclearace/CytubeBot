import {Monitor} from 'forever-monitor';
import {readdir, readFile, rm, stat, writeFile} from 'fs/promises';

import {MAX_RESTARTS, MONITOR_ERROR_LOG_FILE_NAME, RESTART_TIMES_FILE_NAME} from './lib/constants.js';
import {errorLog} from './lib/logger.js';

const child = new Monitor('./lib/start.js', {
  silent: false,
  minUptime: 5000,
  errFile: MONITOR_ERROR_LOG_FILE_NAME,
});

/**
 * Read the number of times the bot has been restarted.
 *
 * @return {!Promise<number>} Number of times the bot has been restarted.
 */
async function readTimes() {
  const timesBuffer = await readFile(RESTART_TIMES_FILE_NAME);
  const times = parseInt(timesBuffer.toString(), 10);
  if (isNaN(times)) {
    errorLog.log('$~~~$ Failed to read restart count (isNaN)\n');
  }
  return times;
}

/**
 * Write the number of times the bot has been restarted to the file.
 *
 * @param {number} times Times the bot has been restarted. Should be an integer.
 */
async function writeTimes(times) {
  try {
    await writeFile(RESTART_TIMES_FILE_NAME, times.toString());
  } catch (err) {
    errorLog.log(err);
    console.log(err);
    child.stop();
    process.exit(1);
  }
};

// Emitted on startup *after* a restart.
child.on('restart', async () => {
  console.log('$~~~$ CytubeBot is restarting\n');
  const times = await readTimes();
  writeTimes(times + 1);
  return;
});

child.on('exit', async () => {
  const times = await readTimes();

  if (times < MAX_RESTARTS) {
    console.log('$~~~$ CytubeBot crashed, restarting\n');
    child.start(/** restart= */ true);
    return;
  }

  console.log(
      `$~~~$ CytubeBot has exited permanently after ${MAX_RESTARTS} restarts ` +
      'or there was a problem\n');
  console.log('$~~~$ Shutting down');
});

// Remove previous monitor_error log files *IF* they're empty.
{
  const files = await readdir('.');
  for (const file of files) {
    if (!file.startsWith('monitor_error')) {
      continue;
    }
    if (file === MONITOR_ERROR_LOG_FILE_NAME) {
      continue;
    }

    const fileStat = await stat(file);
    if (fileStat.isDirectory()) {
      continue;
    }
    if (fileStat.size > 0) {
      continue;
    }

    rm(file);
  }
}

child.start(/** restart= */ false);
writeTimes(0);
