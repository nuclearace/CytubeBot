import express, {static as serveStatic} from 'express';
import {join} from 'path';
import {sendPug} from './pug.js';
import {stat, createReadStream} from 'fs';

export class Server {
  constructor(bot) {
    this.webServer = express();
    this.bot = bot;
    const ioUrl = `${bot.webURL}:${bot.socketPort}`;
    const socketIo = `${ioUrl}/socket.io/socket.io.js`;
    this.webServer.use(serveStatic(join(__dirname, '..', 'www')));

    this.webServer.get('/', (req, res) => {
      sendPug(res, 'stats', {serverIO: socketIo});
    });

    this.webServer.get('/emotes', (req, res) => {
      sendPug(res, 'emotes', {serverIO: socketIo});
    });

    this.webServer.get('/internals', (req, res) => {
      sendPug(res, 'internals', {serverIO: socketIo});
    });

    this.webServer.get('/logs', (req, res) => {
      sendPug(res, 'logs');
    });

    this.webServer.get('/logs/syslog', (req, res) => {
      this.readLog(join(__dirname, '..', 'sys.log'), res);
    });

    this.webServer.get('/logs/cytubelog', (req, res) => {
      this.readLog(join(__dirname, '..', 'cytubelog.log'), res);
    });

    this.webServer.get('/logs/errlog', (req, res) => {
      this.readLog(join(__dirname, '..', 'error.log'), res);
    });

    this.webServer.get('/sioconfig', (req, res) => {
      res.send(`const IO_URL = '${ioUrl}';`);
    });

    if (!bot.webPort) {
      this.webServer.listen(8080);
    }

    this.webServer.listen(bot.webPort);
  }

  readLog(file, res) {
    const length = 1048576;
    stat(file, (err, data) => {
      if (err) {
        return res.send(500);
      }

      const start = Math.max(0, data.size - length);
      if (isNaN(start)) {
        res.send(500);
      }

      const end = Math.max(0, data.size - 1);
      if (isNaN(end)) {
        res.send(500);
      }

      createReadStream(file, {start: start, end: end}).pipe(res);
    });
  }
}
