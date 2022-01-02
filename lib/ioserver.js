import * as sio from 'socket.io';

export class IOServer {
  constructor(srv, bot) {
    const io = sio(srv);
    this.bot = bot;
    io.sockets.on('connection', (socket) => {
      socket.on('getEmotes', () => {
        this.getEmotes((emotes) => {
          socket.emit('emotes', emotes);
        });
      });

      socket.on('getInternals', () => {
        this.handleInternals(socket);
      });

      socket.on('getRoom', () => {
        this.getRoom((room) => {
          socket.emit('room', room);
        });
      });

      socket.on('getStats', () => {
        this.getStats((data) => {
          socket.emit('roomStats', data);
        });
      });
    });
  }

  getEmotes(callback) {
    callback(this.bot.channelEmotes);
  }

  getRoom(callback) {
    callback(this.bot.room);
  }

  getStats(callback) {
    this.bot.getStats((data) => {
      callback(data);
    });
  }

  handleInternals(socket) {
    const status = this.bot.stats;
    const userlist = this.bot.userlist;
    const playlist = this.bot.playlist;
    const processInfo = process.memoryUsage();
    const botInfo = {
      server: this.bot.cytubeServer,
      room: this.bot.room,
      username: this.bot.username,
      useLogger: this.bot.useLogger,
      deleteIfBlockedIn: this.bot.deleteIfBlockedIn,
      socketPort: this.bot.socketPort,
      webURL: this.bot.webURL,
      webPort: this.bot.webPort,
      previousUID: this.bot.previousUID,
      currentUID: this.bot.currentUID,
      currentMedia: this.bot.currentMedia,
      isLeader: this.bot.isLeader,
      startTime: this.bot.startTime,
      heapTotal: processInfo.heapTotal,
      heapUsed: processInfo.heapUsed,
    };

    // Hide IP.
    for (let i = 0; i < userlist.length; i++) {
      delete userlist[i].meta.ip;
      delete userlist[i].meta.aliases;
      delete userlist[i].meta.smuted;
    }

    socket.emit('botStatus', status);
    socket.emit('userlist', userlist);
    socket.emit('playlist', playlist);
    socket.emit('botInfo', botInfo);
  }
}
