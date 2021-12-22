/*
 * This is useful for quick and dirty custom commands
 * This file won't be changed much over the course of time
 * See chatcommands.js for examples on how to add commands
 * All functions should have the signature function(bot, username, data,
 * fromIRC) bot is a reference to the current bot and all of its properties and
 * methods username is the username of the user who is calling the command data
 * is all the information given after the command fromIRC is if the command
 * comes from irc
 */

// Add commands here

const customHandlers = {
  'pyramid': (bot, username, data) => {
    if (!data) {
      return;
    }

    if ((new Date().getTime() - bot.timeSinceLastPyramid) / 1000 < 15) {
      return bot.sendPM(username, 'Pyramid cooldown');
    }

    bot.timeSinceLastPyramid = new Date().getTime();
    const pyra = data.split(' ')[0];
    bot.sendChatMsg('⠀');
    bot.sendChatMsg('⠀ ' + pyra);
    bot.sendChatMsg('⠀ ' + pyra + ' ' + pyra);
    bot.sendChatMsg('⠀ ' + pyra + ' ' + pyra + ' ' + pyra);
    bot.sendChatMsg('⠀ ' + pyra + ' ' + pyra + ' ' + pyra + ' ' + pyra);
    bot.sendChatMsg('⠀ ' + pyra + ' ' + pyra + ' ' + pyra);
    bot.sendChatMsg('⠀ ' + pyra + ' ' + pyra);
    bot.sendChatMsg('⠀ ' + pyra);
  },

  'spam': (bot, username, data) => {
    if (!data) {
      return;
    }

    bot.checkPermission(username, 2, null, (hasPermission) => {
      if (!hasPermission) {
        return;
      }

      const spama = data.split(' ')[0];
      const spaf = data.slice(2);
      for (let i = 0; i < spama; i++) {
        bot.sendChatMsg(spaf);
      }
    });
  },
};

// Shouldn't need to modify things past this point

const customHandlerList = [];
for (const [name, handler] of Object.entries(customHandlers)) {
  customHandlerList.push({
    re: new RegExp('^\\$' + name + '(?:\\s|$)'),
    fn: handler,
  });
}

function handle(bot, username, msg, fromIRC) {
  for (let i = 0; i < customHandlerList.length; i++) {
    const h = customHandlerList[i];
    if (msg.match(h.re)) {
      let rest;
      if (msg.indexOf(' ') >= 0) {
        rest = msg.substring(msg.indexOf(' ') + 1);
      } else {
        rest = '';
      }
      return h.fn(bot, username, rest, fromIRC);
    }
  }
}

exports.handle = handle;
