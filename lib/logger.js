import {createWriteStream} from 'fs';
import lineReader from 'line-reader';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import {promisify} from 'util';

import {AUDIT_LOG_FILE_NAME, ERROR_LOG_FILE_NAME, INFO_LOG_FILE_NAME, MONITOR_ERROR_LOG_FILE_NAME} from './constants.js';

const eachLine = promisify(lineReader.eachLine);

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
      errorLog.log(`!~~~! Log close failed: ${this.filename}`);
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
      errorLog.log(`!~~~! Attempted logwrite failed: ${this.filename}`);
      errorLog.log(`Message was: ${msg}`);
      errorLog.log(e);
    }
  }

  /**
   * Read the file, starting from the front.
   *
   * @param {number} n Number of lines to read.
   * @return {!Promise<!Array<string>>} The lines from the file.
   */
  async read(n) {
    const lines = [];
    await eachLine(this.filename, (line, last) => {
      if (lines.length >= n) {
        return;
      }
      lines.push(line);
    });
    return lines;
  }

  /**
   * Read the file, starting from the end.
   *
   * @param {number} n Number of lines to read.
   * @return {!Promise<!Array<string>>} The lines from the file.
   */
  async readReverse(n) {
    let lineCount = 0;
    await eachLine(this.filename, (line, last) => lineCount++);

    const lines = [];
    let currentLine = 0;
    await eachLine(this.filename, (line, last) => {
      currentLine++;
      if (currentLine <= lineCount - n) {
        return;
      }
      lines.push(line);
    });
    return lines;
  }
}

/** Audit log. */
export const auditLog = new Logger(AUDIT_LOG_FILE_NAME);

/** Error log. */
export const errorLog = new Logger(ERROR_LOG_FILE_NAME);

/** Info log. */
export const infoLog = new Logger(INFO_LOG_FILE_NAME);

/** Error log for the monitor process. Do not log to this - you should only read from it. */
export const monitorErrorLog = new Logger(MONITOR_ERROR_LOG_FILE_NAME);
