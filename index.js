import {Monitor} from 'forever-monitor';
import {readFile, writeFile} from 'fs/promises';

import {MAX_RESTARTS, MONITOR_ERROR_LOG_FILE_NAME, RESTART_TIMES_FILE_NAME} from './lib/constants.js';
import {errorLog} from './lib/logger.js';

const child = new Monitor('./lib/start.js', {
  max: MAX_RESTARTS + 1,
  silent: false,
  minUptime: 5000,
  errFile: MONITOR_ERROR_LOG_FILE_NAME,
});

/** Write the number of times the bot has been restarted to the file. */
async function writeTimes() {
  try {
    await writeFile(RESTART_TIMES_FILE_NAME, String(child.times));
  } catch (err) {
    errorLog.log(err);
    console.log(err);
    child.stop();
    process.exit(1);
  }
};

child.on('exit', async () => {
  const timesBuffer = await readFile(RESTART_TIMES_FILE_NAME);
  const times = parseInt(timesBuffer.toString(), 10);
  if (isNaN(times)) {
    console.log('$~~~$ Failed to read restart count (isNaN)\n');
  }

  // If the exit code !== 0, forever-monitor won't restart it.
  // So do it manually.
  if (times < MAX_RESTARTS) {
    console.log('$~~~$ CytubeBot is restarting\n');
    child.start(/** restart= */ true);
    writeTimes();
    return;
  }

  console.log(
      `$~~~$ CytubeBot has exited after ${MAX_RESTARTS} restarts ` +
      'or there was a problem\n');
  console.log('$~~~$ Shutting down');
});

child.start(/** restart= */ false);
writeTimes();
