import {Monitor} from 'forever-monitor';
import {writeFile} from 'fs/promises';

import {errlog} from './lib/logger.js';

const MAX_RESTARTS = 20;

const child = new Monitor('./lib/start.js', {
  max: MAX_RESTARTS + 1,
  silent: false,
  minUptime: 5000,
  errFile: './err.log',
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

child.on('exit', () => {
  console.log(
      `$~~~$ CytubeBot has exited after ${MAX_RESTARTS} restarts ` +
      'or there was a problem\n');
  console.log('$~~~$ Shutting down');
});

child.on('restart', () => {
  console.log('$~~~$ CytubeBot is restarting after a close\n');
  writeTimes();
});

child.start();
writeTimes();
