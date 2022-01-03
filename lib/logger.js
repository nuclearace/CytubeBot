import {createWriteStream} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';

function getDirName() {
  const __filename = fileURLToPath(import.meta.url);
  return dirname(__filename);
}

function getTimeString() {
  const date = new Date();
  return date.toDateString() + ' ' + date.toTimeString().split(' ')[0];
};

class Logger {
  constructor(filename) {
    this.filename = join(getDirName(), '..', filename);
    this.writer = createWriteStream(this.filename, {
      flags: 'a',
      encoding: 'utf-8',
    });
    this.enabled = true;
  }

  close() {
    try {
      this.writer.end();
    } catch (e) {
      errlog.log(`!~~~! Log close failed: ${this.filename}`);
    }
  }

  /**
   * Write to the file.
   *
   * @param {string} msg The message to be written.
   */
  log(msg) {
    if (!this.enabled) {
      return;
    }

    const str = `[${getTimeString()}] ${msg}\n`;

    try {
      console.log(msg);
      this.writer.write(str);
    } catch (e) {
      if (this.filename.endsWith('error.log')) {
        return;
      }
      errlog.log(`!~~~! Attempted logwrite failed: ${this.filename}`);
      errlog.log(`Message was: ${msg}`);
      errlog.log(e);
    }
  }
}

export const errlog = new Logger('error.log');
export const syslog = new Logger('sys.log');
export const cytubelog = new Logger('cytubelog.log');
