/**
 * Various custom-type commands.
 */

// import {randomInt} from 'crypto';
import humanizeDuration from 'humanize-duration';
import parseDuration from 'parse-duration';
import random from 'random';

import {Rank} from '../constants.js';
import {getCurrentUnixTimestamp, sleep} from '../utils.js';

/** @typedef {import('./handle.js').Handler} Handler */

export const /** @type {!Map<string, Handler>} */ COMMANDS = new Map();

const COCK_MAX_LENGTH = 14;

COMMANDS.set('cock', (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;
  const length = Math.round(Math.random() * COCK_MAX_LENGTH);

  let /** @type {string} */ emote;
  if (length > 10) {
    emote = 'gachiHYPER';
  } else if (length < 4) {
    emote = 'forsenLaughingAtYou';
  } else {
    emote = 'gachiGASM';
  }

  bot.sendChatMsg(`${target}'s cock is ${length} inches long ${emote}`);
});

COMMANDS.set('gn', (bot, username, msg) => {
  bot.sendChatMsg(`FeelsOkayMan <3 gn ${username}`);
});

/** Function that generates a random number based on a normal distribution. */
const normal = random.normal(/** mu= */ 100, /** sigma= */ 15);

COMMANDS.set('iq', (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;
  const iq = Math.round(normal());

  let /** @type {string} */ emote;
  if (iq > 115) {
    emote = ', ah yes 6Head';
  } else if (iq < 85) {
    emote = 'Pepege';
  } else {
    emote = ', average ForsenLookingAtYou';
  }

  bot.sendChatMsg(`${target}'s IQ is ${iq} ${emote}`);
});

COMMANDS.set('pyramid', async (bot, username, msg) => {
  if (!msg) {
    return;
  }

  if (!bot.pyramidLimiter.tryRemoveTokens(1)) {
    return bot.sendPm(username, '$pyramid is on cooldown');
  }

  // Send an invisible character first so all of the pyramid lines are aligned (second and
  // subsequent message in a row are left-aligned in chat)
  bot.sendChatMsg('⠀');

  const word = msg.split(' ')[0];
  bot.sendChatMsg(`⠀ ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word} ${word}`);
  bot.sendChatMsg(`⠀ ${word}`);
});

COMMANDS.set('tuck', (bot, username, msg) => {
  const target = msg.split(' ')[0];
  if (target === '') {
    bot.sendChatMsg(
        `${username}, who do you want to tuck in? FeelsOkayMan ` +
        'Example: $tuck MrDestructoidCyDJ');
  }

  bot.sendChatMsg(`Bedge ${username} tucks ${target} into bed.`);
});

COMMANDS.set('mc', (bot, username, msg) => {
  bot.sendChatMsg(
      `${username}, We have a community Minecraft Anarchy Server thats open` +
      ` to everyone. Info on the server and joining here: https://discord.gg/bZtYVSC8gY`);
});

COMMANDS.set('mcinfo', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.ADMIN))) {
    bot.sendChatMsg(`${username} does not have permission to enable mcinfo. FeelsWeirdMan`);
    return;
  }
  const words = msg.split(' ');
  let amount = words[1];
  const waitTime = parseDuration(words.slice(0).join(' '), /** format= */ 'sec');
  if (isNaN(waitTime) || waitTime < 0) {
    bot.sendChatMsg('Failed to parse interval time. Example $mcinfo 1h 24');
    return;
  }
  if (isNaN(amount) || amount < 0) {
    bot.sendChatMsg('Failed to parse amount. Example $mcinfo 30m 12');
    return;
  }
  const waitTimeMs = waitTime * 1000;
  const interval = humanizeDuration(waitTime * 1000);
  bot.sendChatMsg(`/me Now sending mcinfo ${amount} times, every ${interval}`);

  while (amount != 0) {
    bot.sendChatMsg(
        `We have a community Minecraft Anarchy Server thats open` +
        ` to everyone. Info on the server and joining here: https://discord.gg/bZtYVSC8gY`);
    await sleep(waitTimeMs);
    amount--;
  }
});

const H_TIER_SHIP = [
  'CatAHomie they go together like salt and pepper.',
  'klaiusGuraHug they should get married.',
  'dankHug a perfect match.',
  'elisLove a match made in heaven',
  'OnionFlushed',
];

const MH_TIER_SHIP = [
  'monkaHmm not a bad match.',
  'They have a decent chance, just bUrself',
  'OkayMan they make an okay match man.',
  'veiHugging they make a good match most of the time.',
  'muniSip what are you waiting for?',
];

const ML_TIER_SHIP = [
  'pepegaGamble its a bit of a gamble.',
  'They may not be the best together, but the drama would be fun to watch JuiceTime',
  'VeryPog',
  'DocLookingAtYourWife',
  'klaiusGuraLost that may be a lost cause.',
];

const L_TIER_SHIP = [
  'CaitlynS run.',
  'They go together like cereal and orange juice DansGame',
  'monkaS I\'ve seen into your future together, it doesn\'t look good..',
  'Awkward ...',
  'FeelsBadMan not a match.',
  'ElNoSabe el no sabe',
];

COMMANDS.set('ship', async (bot, username, msg) => {
  const words = msg.split(' ');
  const first = words[0];
  const second = words[1];

  if (first === '') {
    bot.sendChatMsg('Invalid syntax. Examples: $ship iP0G spintto / $ship iP0G');
    return;
  }

  const sPercent = Math.floor(Math.random() * 101);
  const sPhrase = (() => {
    if (sPercent <= 25) {
      return L_TIER_SHIP[Math.floor(Math.random() * L_TIER_SHIP.length)];
    } else if ((sPercent > 25) && (sPercent <= 50)) {
      return ML_TIER_SHIP[Math.floor(Math.random() * ML_TIER_SHIP.length)];
    } else if ((sPercent > 50) && (sPercent <= 75)) {
      return MH_TIER_SHIP[Math.floor(Math.random() * MH_TIER_SHIP.length)];
    } else if (sPercent > 75) {
      return H_TIER_SHIP[Math.floor(Math.random() * H_TIER_SHIP.length)];
    }
  })();

  if (second != null) {
    bot.sendChatMsg(`${first} and ${second} have a ${sPercent}% compatibility. ${sPhrase}`);
  } else {
    bot.sendChatMsg(`${username} and ${first} have a ${sPercent}% compatibility. ${sPhrase}`);
  }
});

// const timersRead = CytubeBot.readTimerPhrases();
// const tEndsRead = await bot.readTimerEnds();
// const tStartsRead = await bot.readTimerStarts();
let timers = [];       // assoc file timers.txt
let timerEnds = [];    // assoc file tEnd.txt
let timerStarts = [];  // assoc file tStarts.txt
// timers = timers.concat(timersRead);
// timerEnds = timerEnds.concat(tEndsRead);
// timerStarts = timerStarts.concat(tStartsRead);

COMMANDS.set('timer', async (bot, username, msg) => {
  const words = msg.split(' ');
  const waitTime = parseDuration(words[0], /** format= */ 'sec');
  if (isNaN(waitTime) || waitTime < 0) {
    bot.sendChatMsg('Failed to parse time. Example: $timer 10m this is my timer message');
    return;
  }
  for (let w = 0; w < words.length; w++) {
    if (words[w] === 'do') {
      for (let w = 0; w < words.length; w++) {
        if (words[w] === 'poof') {
          bot.sendChatMsg(`Nice try forsenCD`);
          return;
        }
      }
    }
  }
  const message = words.slice(1).join(' ');
  const waitTimeMs = waitTime * 1000;
  const interval = humanizeDuration(waitTime * 1000);
  bot.sendChatMsg(`/me [blue]${username}[/] set a timer for ${interval}`);
  const end = getCurrentUnixTimestamp() + waitTime;
  timers.push(message);
  timerEnds.push(end);
  const tStart = getCurrentUnixTimestamp();
  timerStarts.push(tStart);
  // ToDo: create logic to save/load from file

  bot.writeTimerPhrases(timers);
  bot.writeTimerEnds(timerEnds);
  bot.writeTimerStarts(timerStarts);

  await sleep(waitTimeMs);
  bot.sendChatMsg(`[red][TIMER: ${interval}][/]: ${message}`);
  const indexTmsg = timers.indexOf(message);
  timers.splice(indexTmsg, 1);
  const indexTend = timerEnds.indexOf(end);
  timerEnds.splice(indexTend, 1);
  const indexTstart = timerStarts.indexOf(tStart);
  timerStarts.splice(indexTstart, 1);
  bot.writeTimerPhrases(timers);
  bot.writeTimerEnds(timerEnds);
  bot.writeTimerStarts(timerStarts);
});

let timeWithMsg = [];
let timeLeft = [];
let firstAfterRestart = true;

function setFirstAfterR() {
  firstAfterRestart = false;
  return firstAfterRestart;
}
function removeDuplicates(arr) {
  return arr.filter((item, index) => arr.indexOf(item) === index);
}

// need to add logic for if timers are saved from before bot restart
COMMANDS.set('timers', async (bot, username, msg) => {
  // bot.sendChatMsg(`There are currently no active timers.`);
  if (firstAfterRestart === true) {
    const timersRead = await bot.readTimerPhrases();
    const timerEndsRead = await bot.readTimerEnds();
    const timerStartsRead = await bot.readTimerStarts();
    const tRead = timersRead;
    if ((tRead.length === 0) && (timers.length === 0)) {
      bot.sendChatMsg(`There are currently no active timers.`);
      setFirstAfterR();
      return;
    } else if (tRead.length === 0) {
      // bot.sendChatMsg(`read null/current yes`);
      setFirstAfterR();
    } else {
      timers = timers.concat(timersRead);
      timerEnds = timerEnds.concat(timerEndsRead);
      timerStarts = timerStarts.concat(timerStartsRead);
      timers = removeDuplicates(timers);
      timerEnds = removeDuplicates(timerEnds);
      timerStarts = removeDuplicates(timerStarts);
      setFirstAfterR();
      // bot.sendChatMsg(`notnull 0 test ${tRead.length}`);
    }
  }
  timeLeft = [];
  timeWithMsg = [];

  if (timers.length === 0) {
    bot.sendChatMsg(`There are currently no active timers.`);
    return;
  }
  for (let h = 0; h < timerEnds.length; h++) {
    const timerEnd = timerEnds[h] - getCurrentUnixTimestamp();
    const tmrEnd = humanizeDuration(timerEnd * 1000);
    timeLeft.push(tmrEnd);
  }
  for (let i = 0; i < timers.length; i++) {
    const percentDone =
        ((timerEnds[i] - getCurrentUnixTimestamp()) / (timerEnds[i] - timerStarts[i])) * 100;
    if (percentDone > 66) {
      timeWithMsg.push(`${i + 1}. ${timers[i]} [bw][green]${timeLeft[i]} left.[/][/]`);
    } else if ((percentDone <= 66) && percentDone > 33) {
      timeWithMsg.push(`${i + 1}. ${timers[i]} [bw][yellow]${timeLeft[i]} left.[/][/]`);
    } else {
      timeWithMsg.push(`${i + 1}. ${timers[i]} [bw][red]${timeLeft[i]} left.[/][/]`);
    }
  }
  bot.sendChatMsg(`Active timers:`);
  for (let m = 0; m < timeWithMsg.length; m++) {
    bot.sendChatMsg(`${timeWithMsg[m]}`);
  }
});
