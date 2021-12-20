const express = require('express');
const path = require('path');
const sendPug = require('./pug').sendPug;
const fs = require('fs');

module.exports = {
  init: (bot) => {
    const server = new Server(bot);
    return server;
  },
};

class Server {
  constructor(bot) {
    const self = this;
    this.webServer = express();
    this.bot = bot;
    const ioUrl = bot.webURL + ':' + bot.socketPort;
    const socketIo = ioUrl + '/socket.io/socket.io.js';
    this.webServer.use(express.static(path.join(__dirname, '..', 'www')));

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
      self.readLog(path.join(__dirname, '..', 'sys.log'), res);
    });

    this.webServer.get('/logs/cytubelog', (req, res) => {
      self.readLog(path.join(__dirname, '..', 'cytubelog.log'), res);
    });

    this.webServer.get('/logs/errlog', (req, res) => {
      self.readLog(path.join(__dirname, '..', 'error.log'), res);
    });

    this.webServer.get('/sioconfig', (req, res) => {
      res.send(
          'var IO_URL =' +
          '\'' + ioUrl + '\'');
    });

    if (!bot.webPort) {
      this.webServer.listen(8080);
    }

    this.webServer.listen(bot.webPort);
  }

  readLog(file, res) {
    const length = 1048576;
    fs.stat(file, (err, data) => {
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

      fs.createReadStream(file, {start: start, end: end}).pipe(res);
    });
  }
}
