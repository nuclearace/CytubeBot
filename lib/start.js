import {loadConfig} from './config.js';
import {CytubeBot} from './cytubebot.js';

process.on('exit', () => console.log('\n!~~~! CytubeBot is shutting down\n'));

const config = await loadConfig();
const bot = new CytubeBot(config);

// Join the room.
if (bot.socket) {
  bot.start();
}
