const path = require('path');
const fs = require('fs');

function getTimeString() {
  const date = new Date();
  return date.toDateString() + ' ' + date.toTimeString().split(' ')[0];
};

class Logger {
  constructor(filename) {
    this.filename = filename;
    this.writer = fs.createWriteStream(filename, {
      flags: 'a',
      encoding: 'utf-8',
    });
    this.enabled = true;
  }

  close() {
    try {
      this.writer.end();
    } catch (e) {
      errlog.log('!~~~! Log close failed: ' + this.filename);
    }
  }

  // Write to the file
  // msg - The message to be written
  log(msg) {
    if (!this.enabled) {
      return;
    }

    const str = '[' + getTimeString() + '] ' + msg + '\n';

    try {
      this.writer.write(str);
    } catch (error) {
      errlog.log('!~~~! Attempted logwrite failed: ' + this.filename);
      errlog.log('Message was: ' + msg);
      errlog.log(e);
    }
  }
}

function makeNewLoggerWithConsoleOutput(filename) {
  const log = new Logger(filename);
  log._log = log.log;
  log.log = function(...args) {
    console.log(...args);
    this._log(...args);
  };
  return log;
};

const errlog =
    makeNewLoggerWithConsoleOutput(path.join(__dirname, '..', 'error.log'));
const syslog =
    makeNewLoggerWithConsoleOutput(path.join(__dirname, '..', 'sys.log'));
const cytubelog =
    makeNewLoggerWithConsoleOutput(path.join(__dirname, '..', 'cytubelog.log'));

module.exports = {
  logger: Logger,
  errlog: errlog,
  syslog: syslog,
  cytubelog: cytubelog,
};
