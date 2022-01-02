import {load} from './config.js';
import {CytubeBot} from './cytubebot.js';

process.on('exit', () => console.log('\n!~~~! CytubeBot is shutting down\n'));

let /** @type {CytubeBot} */ bot;

load((config) => {
  bot = new CytubeBot(config);

  // Join the room.
  if (bot.socket) {
    bot.start();
  }
});
