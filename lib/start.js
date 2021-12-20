var CytubeBot = require('./cytubebot');
var Config = require('./config');

process.on('exit', () => {
  console.log('\n!~~~! CytubeBot is shutting down\n');
});

var bot = {};
Config.load(config => {
  bot = CytubeBot.init(config);

  // Join the room
  if (bot.socket) {
    bot.start();
  }
});
