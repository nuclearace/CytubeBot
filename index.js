import {Monitor} from 'forever-monitor';
import {readFile, writeFile} from 'fs/promises';

import {errlog} from './lib/logger.js';

const MAX_RESTARTS = 30;

const child = new Monitor('./lib/start.js', {
  max: MAX_RESTARTS + 1,
  silent: false,
  minUptime: 5000,
  errFile: './monitor-error.log',
});

/** Write the number of times the bot has been restarted to the file. */
async function writeTimes() {
  try {
    await writeFile('times', String(child.times));
  } catch (err) {
    errlog.log(err);
    console.log(err);
    child.stop();
    process.exit(1);
  }
};

child.on('exit', async () => {
  const timesBuffer = await readFile('times');
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
