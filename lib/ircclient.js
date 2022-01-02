import {Client} from 'irc';

import {handle} from './chatcommands.js';
import {cytubelog, errlog, syslog} from './logger.js';

export class IRCClient {
  constructor(ircInfo, bot) {
    syslog.log('Starting IRC');

    this.bot = bot;
    this.ircServer = this.parseServer(ircInfo.server);
    this.nick = ircInfo.nick;
    this.channel = ircInfo.channel;
    this.pass = ircInfo.pass;
    this.connected = false;

    this.client = new Client(this.ircServer.server, this.nick, {
      debug: true,
      userName: 'CytubeBot',
      autoConnect: false,
      channels: [this.channel],
      port: this.ircServer.port,
    });

    this.client.addListener(`message${this.channel}`, (from, message) => {
      this.handleIRCMessage(from, message);
    });

    this.client.addListener('registered', (message) => {
      this.connected = true;
    });

    this.client.addListener('error', (error) => {
      errlog.log(`I~~~I: ${error}`);
    });
  }

  /**
   * Handles messages from the IRC server.
   *
   * @param {string} from Who sent the message.
   * @param {string} message The actual message.
   */
  handleIRCMessage(from, message) {
    cytubelog.log(`IRC Message: ${from}: ${message}`);
    this.bot.sendChatMsg(`(${from}): ${message}`);
    if (message.indexOf('$') === 0 && from != this.nick && this.bot.loggedIn) {
      handle(this.bot, from, message, true);
    }
  }

  /**
   * Parses IRCserver info from config.
   *
   * Used to get the port number, if specified.
   *
   * @param {string} server The server.
   * @return {?}
   */
  parseServer(server) {
    const matcher = server.match(/(.*):(\d*)?/);
    const serverObject = {
      server: null,
      port: null,
    };

    if (matcher) {
      serverObject.server = matcher[1];
      serverObject.port = matcher[2];
    } else {
      serverObject.server = server;
      serverObject.port = 6667;
    }

    return serverObject;
  }

  /**
   * Sends a message over IRC.
   *
   * @param {string} message The message to send.
   */
  sendMessage(message) {
    if (this.connected) {
      this.client.say(this.channel, message);
    }
  };

  /** Starts the connection to the server. */
  start() {
    this.client.connect();
    if (this.pass) {
      setTimeout(() => {
        if (this.connected !== true) {
          return console.log('Not Connected to IRC.');
        }
        this.client.say('NickServ', `IDENTIFY ${this.pass}`);
      }, 5000);
    }
  }
}
