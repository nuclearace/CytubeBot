import {loadConfig} from './config.js';
import {CytubeBot} from './cytubebot.js';

process.on('exit', () => console.log('\n!~~~! CytubeBot is shutting down\n'));

const config = await loadConfig();
const bot = new CytubeBot(config);

// Join the room.
if (bot.socket) {
  bot.start();
}

const AUTOMATIC_POINTS_INTERVAL_MINS = 10;
const AUTOMATIC_ACTIVE_POINTS = 10;
const AUTOMATIC_AFK_POINTS = 3;

setInterval(
    () => bot.grantAutomaticUserPoints(
        AUTOMATIC_ACTIVE_POINTS, AUTOMATIC_AFK_POINTS),
    AUTOMATIC_POINTS_INTERVAL_MINS * 60 * 1000);
