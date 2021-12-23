import {createWriteStream} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getTimeString() {
  const date = new Date();
  return date.toDateString() + ' ' + date.toTimeString().split(' ')[0];
};

class Logger {
  constructor(filename) {
    this.filename = filename;
    this.writer = createWriteStream(filename, {
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

export const errlog =
    makeNewLoggerWithConsoleOutput(join(__dirname, '..', 'error.log'));
export const syslog =
    makeNewLoggerWithConsoleOutput(join(__dirname, '..', 'sys.log'));
export const cytubelog =
    makeNewLoggerWithConsoleOutput(join(__dirname, '..', 'cytubelog.log'));
