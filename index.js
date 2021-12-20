const forever = require('forever-monitor');
const fs = require('fs');

const child = new (forever.Monitor)(
    './lib/start.js',
    {max: 21, silent: false, minUptime: 5000, errFile: './err.log'});

const writeTimes = () => {
  fs.writeFile('times', String(child.times), err => {
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
