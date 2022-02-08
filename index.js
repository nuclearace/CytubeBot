import {Monitor} from 'forever-monitor';
import {writeFile} from 'fs';

const child = new Monitor(
    './lib/start.js',
    {max: 21, silent: false, minUptime: 5000, errFile: './err.log'});

/** Write the number of times the bot has been restarted to the file. */
function writeTimes() {
  writeFile('times', String(child.times), (err) => {
    if (err) {
      console.log(err);
      child.stop();
      process.exit(1);
    }
  });
};

child.on('exit', () => {
  console.log(
      '$~~~$ CytubeBot has exited after 20 restarts or there was a problem\n');
  console.log('$~~~$ Shutting down');
});

child.on('restart', () => {
  console.log('$~~~$ CytubeBot is restarting after a close\n');
  writeTimes();
});

child.start();
writeTimes();
