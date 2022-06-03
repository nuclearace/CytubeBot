/**
 * Points/gamba commands.
 */

import {randomInt} from 'crypto';

import {Rank} from '../constants.js';
import {PendingDuel} from '../gamba.js';

/** @typedef {import('./handle.js').Handler} Handler */

/**
 * See readme for chat commands.
 *
 * @type {!Map<string, Handler>}
 */
export const COMMANDS = new Map();

COMMANDS.set('acceptduel', async (bot, username, msg) => {
  const duel = bot.gamba.pendingDuels.filter((duel) => duel.target === username).at(0);
  if (!duel) {
    bot.sendChatMsg('No pending duels.');
    return;
  }
  bot.gamba.pendingDuels = bot.gamba.pendingDuels.filter((duel) => duel.target !== username);

  const win = randomInt(0, 2) === 1;

  const winner = win ? duel.target : duel.initiator;
  const loser = win ? duel.initiator : duel.target;

  await bot.db.updateUserPoints(winner, duel.amount);
  await bot.db.updateUserPoints(loser, -duel.amount);

  bot.sendChatMsg(`${winner} won the duel and receives ${duel.amount} points!`);
});

COMMANDS.set('addpoints', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to addpoints. FeelsWeirdMan`);
    return;
  }

  const user = msg.split(' ')[0];
  if (!isNaN(parseInt(user, 10))) {
    bot.sendChatMsg(
        'Username must be provided for addpoints. ' +
        'Example: $addpoints airforce2700 100000 PagMan');
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg(
        'Points amount must be provided. ' +
        'Example: $addpoints airforce2700 100');
    return;
  }

  const deltaMsg = msg.split(' ')[1].toLowerCase();
  const delta = deltaMsg === 'all' ? Number.MAX_VALUE : parseInt(deltaMsg, 10);

  await bot.db.updateUserPoints(user, delta);

  const newPoints = await bot.db.getUserPoints(user);
  bot.sendChatMsg(`${user} now has ${newPoints} points`);
});

COMMANDS.set('declineduel', async (bot, username, msg) => {
  const duel = bot.gamba.pendingDuels.filter((duel) => duel.target === username).at(0);
  if (!duel) {
    bot.sendChatMsg('No pending duels.');
    return;
  }
  bot.gamba.pendingDuels = bot.gamba.pendingDuels.filter((duel) => duel.target !== username);
  bot.sendChatMsg('Declined duel.');
});

COMMANDS.set('duel', async (bot, username, msg) => {
  const targetUser = msg.split(' ')[0];
  if (!targetUser) {
    return;
  }

  const words = msg.split(' ');
  for (let w = 0; w < words.length; w++) {
    if (words[w] === '!poof') {
      bot.sendChatMsg('forsenCD Nice try.');
      return;
    }
  }

  if (bot.gamba.pendingDuels.filter((duel) => duel.initiator === username).length > 0) {
    bot.sendChatMsg(`${username}: you already have a duel pending`);
    return;
  }
  if (bot.gamba.pendingDuels.filter((duel) => duel.target === targetUser).length > 0) {
    bot.sendChatMsg(`${targetUser} already has a duel pending`);
    return;
  }


  if (!bot.userlist.map((user) => user.name).includes(targetUser)) {
    bot.sendChatMsg(`${targetUser} is not in chat Pepege`);
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to duel with Sadeg`);
    return;
  }
  const targetUserPoints = await bot.db.getUserPoints(targetUser);
  if (targetUserPoints === 0) {
    bot.sendChatMsg(`${targetUser} doesn't have any points to duel with Sadge`);
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg('Points amount must be provided. Example: $duel someone 100');
    return;
  }
  const duelAmountMsg = msg.split(' ')[1].toLowerCase();
  const duelAmount = duelAmountMsg === 'all' ? currentPoints : parseInt(duelAmountMsg, 10);
  if (isNaN(duelAmount)) {
    bot.sendChatMsg('Failed to parse points amount. Example: $duel someone 100');
    return;
  }
  if (duelAmount > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't duel for more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (duelAmount > targetUserPoints) {
    bot.sendChatMsg(
        `${targetUser} doesn't have enough points for that duel FeelsBadMan ` +
        `(they have ${targetUserPoints} points)`);
    return;
  }
  if (duelAmount < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  bot.gamba.pendingDuels.push(new PendingDuel(username, targetUser, duelAmount));
  bot.sendChatMsg(
      `${username} has challenged ${targetUser} to a duel for ${duelAmount} points! ` +
      `Type $acceptduel or $declineduel ` +
      `in the next ${PendingDuel.EXPIRE_AFTER.as('seconds')} seconds.`);
});

COMMANDS.set('givepoints', async (bot, username, msg) => {
  const targetUser = msg.split(' ')[0];
  if (!targetUser) {
    return;
  }

  const allUsers = await bot.db.getAllUsers();
  if (!allUsers.includes(targetUser)) {
    bot.sendChatMsg(`User ${targetUser} not found modCheck`);
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to give Sadeg`);
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg(
        'Points amount must be provided. ' +
        'Example: $givepoints airforce2700 100');
    return;
  }
  const givingAmountMsg = msg.split(' ')[1].toLowerCase();
  const givingAmount = givingAmountMsg === 'all' ? currentPoints : parseInt(givingAmountMsg, 10);
  if (isNaN(givingAmount)) {
    bot.sendChatMsg('Failed to parse points amount. Example: $givepoints airforce2700 100');
    return;
  }
  if (givingAmount > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't give more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (givingAmount < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  await bot.db.updateUserPoints(username, -givingAmount);
  await bot.db.updateUserPoints(targetUser, givingAmount);

  bot.sendChatMsg(`${username} gave ${givingAmount} points to ${targetUser} FeelsOkayMan`);
});

COMMANDS.set('join', async (bot, username, msg) => {
  if (!bot.gamba.raffleInProgress) {
    bot.sendPm(username, 'No raffle in progress');
  }
  bot.gamba.usersInRaffle.add(username);
});

COMMANDS.set('leaderboard', async (bot, username, msg) => {
  const pageSize = 5;
  const pageMsg = msg.split(' ')[0];
  const pageMsgParsed = pageMsg !== '' ? parseInt(pageMsg, 10) : 1;
  const pageNumber = !isNaN(pageMsgParsed) ? pageMsgParsed : 1;
  const firstRank = ((pageNumber - 1) * pageSize) + 1;
  if (pageNumber > 10000) {
    bot.sendChatMsg(`Nice try forsenCD`);
    return;
  }
  if (pageNumber < 0) {
    bot.sendChatMsg(`The page number needs to be a positive number Pepega Clap`);
    return;
  }

  const page = await bot.db.getPointsLeaderboardPage(pageNumber - 1, pageSize);
  const start = firstRank;
  const end = firstRank + page.length - 1;

  const pmIfUserCountGreaterThan = 50;

  const deliver = bot.userlist.length > pmIfUserCountGreaterThan ?
      (msg) => bot.sendPm(username, msg) :
      (msg) => bot.sendChatMsg(msg);

  if (bot.userlist.length > pmIfUserCountGreaterThan) {
    if (bot.leaderboardLargeChatLimiter.tryRemoveTokens(1)) {
      bot.sendChatMsg(`PMing leaderboard due to high # of users in chat`);
    }
  }

  deliver(`Points leaderboard ${start}-${end}:`);

  for (const [i, user] of page.entries()) {
    const rank = i + firstRank;
    deliver(`#${rank} ${user.points} points: ${user.name}`);
  }

  if (page.length === pageSize) {
    deliver(`For the next page, do $leaderboard ${pageNumber + 1}`);
  }
});

// eslint-disable-next-line valid-jsdoc
const /** @type {Handler} */ pointsHandler = async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;

  let rank = 1;
  let points = -1;

  let pageNumber = 0;
  const pageSize = 100;
  pageLoop: while (true) {
    const page = await bot.db.getPointsLeaderboardPage(pageNumber, pageSize);
    for (const user of page) {
      if (user.name === target) {
        points = user.points;
        break pageLoop;
      }
      rank++;
    }

    if (page.length < pageSize) {
      bot.sendChatMsg(`Couldn't find ${target}'s rank`);
      return;
    }

    pageNumber++;
  }

  bot.sendChatMsg(`${target} has ${points} points (rank ${rank})`);
};

COMMANDS.set('p', pointsHandler);
COMMANDS.set('points', pointsHandler);
COMMANDS.set('userpoints', pointsHandler);

COMMANDS.set('raffle', async (bot, username, msg) => {
  if (!(await bot.db.moduleIsEnabled('raffle'))) {
    bot.sendChatMsg('Raffle module is disabled. To enable, use $module raffle on');
    return;
  }

  if (bot.gamba.raffleInProgress) {
    bot.sendChatMsg('A raffle is already in progress Pepega');
  }
  if (bot.gamba.raffleLimiter.getTokensRemaining() < 1) {
    bot.sendPm(username, '$raffle is on cooldown');
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to raffle with Sadeg`);
    return;
  }

  const pointsMsg = msg.split(' ')[0];
  if (pointsMsg === '') {
    bot.sendChatMsg(`Points amount must be provided, ex: $raffle 1000`);
    return;
  }
  let /** @type {number} */ points;
  if (pointsMsg === 'all') {
    points = currentPoints;
  } else if (pointsMsg.endsWith('%')) {
    const percent = parseInt(pointsMsg, 10);
    if (isNaN(percent)) {
      bot.sendChatMsg('Failed to parse percent. Example: $raffle 10%');
      return;
    }
    points = Math.floor((percent / 100) * currentPoints);
  } else {
    points = parseInt(pointsMsg, 10);
  }
  if (isNaN(points)) {
    bot.sendChatMsg(`Failed to parse points amount. ex: $raffle 1000`);
    return;
  }

  if (points > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't raffle more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (points < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  await bot.db.updateUserPoints(username, -points);
  await bot.gamba.raffleLimiter.removeTokens(1);
  bot.gamba.raffleInProgress = true;

  const raffleTimeSeconds = 30;

  bot.sendChatMsg(
      `${username} has started a raffle for ${points} points. ` +
      `Type $join in the next ${raffleTimeSeconds} seconds to join!`);

  setTimeout(async () => {
    let /** @type {string} */ winner;
    if (bot.gamba.usersInRaffle.size === 0) {
      winner = username;
      bot.sendChatMsg('No-one joined the raffle...');
    } else {
      const users = Array.from(bot.gamba.usersInRaffle.values());
      winner = users[randomInt(bot.gamba.usersInRaffle.size)];
      bot.sendChatMsg(`${winner} won the raffle and receives ${points} points!`);
    }
    await bot.db.updateUserPoints(winner, points);
    bot.gamba.raffleInProgress = false;
    bot.gamba.usersInRaffle.clear();
  }, raffleTimeSeconds * 1000);
});

COMMANDS.set('removepoints', async (bot, username, msg) => {
  if (!(await bot.checkPermission(username, Rank.MOD, null))) {
    bot.sendChatMsg(`${username} does not have permission to removepoints. FeelsWeirdMan`);
    return;
  }

  const user = msg.split(' ')[0];
  if (!isNaN(parseInt(user, 10))) {
    bot.sendChatMsg(
        'Username must be provided for removepoints. Example: $removepoints IP0G 100000 :tf:');
    return;
  }

  if (msg.split(' ')[1] === undefined) {
    bot.sendChatMsg('Points amount must be provided. Example: $removepoints IP0G 100');
    return;
  }

  const deltaMsg = msg.split(' ')[1].toLowerCase();
  const delta = deltaMsg === 'all' ? Number.MAX_VALUE : parseInt(deltaMsg, 10);

  await bot.db.updateUserPoints(user, -delta);

  const newPoints = await bot.db.getUserPoints(user);
  bot.sendChatMsg(`${user} now has ${newPoints} points`);
});

COMMANDS.set('rank', async (bot, username, msg) => {
  const target = msg.split(' ')[0] !== '' ? msg.split(' ')[0] : username;

  let rank = 1;
  let points = -1;

  let pageNumber = 0;
  const pageSize = 100;
  pageLoop: while (true) {
    const page = await bot.db.getPointsLeaderboardPage(pageNumber, pageSize);
    for (const user of page) {
      if (user.name === target) {
        points = user.points;
        break pageLoop;
      }
      rank++;
    }

    if (page.length < pageSize) {
      bot.sendChatMsg(`Couldn't find ${target}'s rank`);
      return;
    }

    pageNumber++;
  }

  bot.sendChatMsg(`${target} is rank ${rank} on the leaderboard with ${points} points`);
});

COMMANDS.set('roulette', async (bot, username, msg) => {
  if (!(await bot.db.moduleIsEnabled('roulette'))) {
    bot.sendChatMsg('Roulette module is disabled. To enable, use $module roulette on');
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to roulette with Sadeg`);
    return;
  }

  const gambledAmountMsg = msg.split(' ')[0].toLowerCase();
  let /** @type {number} */ gambledPoints;
  if (gambledAmountMsg === 'all') {
    gambledPoints = currentPoints;
  } else if (gambledAmountMsg.endsWith('%')) {
    const percent = parseInt(gambledAmountMsg, 10);
    if (isNaN(percent)) {
      bot.sendChatMsg('Failed to parse roulette percent. Example: $roulette 10%');
      return;
    }
    gambledPoints = Math.floor((percent / 100) * currentPoints);
  } else {
    gambledPoints = parseInt(gambledAmountMsg, 10);
  }
  if (isNaN(gambledPoints)) {
    bot.sendChatMsg('Failed to parse roulette amount. Example: $roulette 5');
    return;
  }

  if (gambledPoints > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't roulette more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (gambledPoints < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  const win = randomInt(100) > (100 - bot.rouletteWinPercentage);
  const delta = win ? gambledPoints : -gambledPoints;
  await bot.db.updateUserPoints(username, delta);

  const newPoints = currentPoints + delta;
  let /** @type {string} */ comment;
  if (newPoints === 0) {
    comment = `-${currentPoints} OMEGALUL`;
  } else if (delta === currentPoints) {
    comment = 'xqcCheer';
  } else {
    comment = win ? 'PagMan' : 'Sadeg';
  }

  bot.sendChatMsg(
      `${username} ${win ? 'won' : 'lost'} ` +
      `${gambledPoints} points in roulette ` +
      `and now has ${newPoints} points! ${comment}`);
});

const SMP_HIGH_TIER_EMOTES = [
  'xqcL',
  'PagMan',
  'TriHard',
  'klaiusGuraRickRoll',
  'FEELSWAYTOOGOOD',
];
const SMP_MID_TIER_EMOTES = [
  'monkaPog',
  'halalChad',
  'PagPls',
  'CrabPls',
  'Okayeg',
  'CaitlynS',
  'veiO',
  'mendoUA',
  'elisNom',
  'mendoUWU',
  'FeelsOkayMan',
  'monkaS',
];
const SMP_LOW_TIER_EMOTES = [
  '4HEad',
  'pepegaGamble',
  'ForsenLookingAtYou',
  'DonkDink',
  'Bald1G',
  'OnionWTF',
  'elisComfy',
  'PoroSad',
  'DansGame',
];
const SMP_EMOTES = [
  ...SMP_HIGH_TIER_EMOTES,
  ...SMP_MID_TIER_EMOTES,
  ...SMP_LOW_TIER_EMOTES,
];

COMMANDS.set('smp', async (bot, username, msg) => {
  if (!await bot.db.moduleIsEnabled('smp')) {
    bot.sendChatMsg('smp module is disabled. To enable, use $module smp on');
    return;
  }

  const currentPoints = await bot.db.getUserPoints(username);
  if (currentPoints === 0) {
    bot.sendChatMsg(`${username}: you don't have any points to do a slot machine pull with Sadeg`);
    return;
  }

  const gambledAmountMsg = msg.split(' ')[0].toLowerCase();
  let /** @type {number} */ gambledPoints;
  if (gambledAmountMsg === 'all') {
    gambledPoints = currentPoints;
  } else if (gambledAmountMsg.endsWith('%')) {
    const percent = parseInt(gambledAmountMsg, 10);
    if (isNaN(percent)) {
      bot.sendChatMsg('Failed to parse smp percent. Example: $smp 10%');
      return;
    }
    gambledPoints = Math.floor((percent / 100) * currentPoints);
  } else {
    gambledPoints = parseInt(gambledAmountMsg, 10);
  }
  if (isNaN(gambledPoints)) {
    bot.sendChatMsg('Failed to parse smp amount. Example: $smp 5');
    return;
  }

  if (gambledPoints > currentPoints) {
    bot.sendChatMsg(
        `${username}: You can't smp more points than you have Pepega ` +
        `(you have ${currentPoints} points)`);
    return;
  }
  if (gambledPoints < 0) {
    bot.sendChatMsg('nice try forsenCD');
    return;
  }

  const slot1 = SMP_EMOTES[randomInt(SMP_EMOTES.length)];
  const slot2 = SMP_EMOTES[randomInt(SMP_EMOTES.length)];
  const slot3 = SMP_EMOTES[randomInt(SMP_EMOTES.length)];

  const multiplier = (() => {
    // All three slots match
    if (slot1 === slot2 && slot2 === slot3) {
      if (SMP_HIGH_TIER_EMOTES.includes(slot1)) {
        return 50;
      } else if (SMP_MID_TIER_EMOTES.includes(slot1)) {
        return 35;
      }
      return 25;
    }

    // Slot 1 and 3 match OR Slot 1 and 2 match
    if (slot1 === slot3 || slot1 === slot2) {
      if (SMP_HIGH_TIER_EMOTES.includes(slot1)) {
        return 20;
      } else if (SMP_MID_TIER_EMOTES.includes(slot1)) {
        return 5;
      }
      return 2;
    }

    // Only slot 2 and 3 match
    if (slot2 === slot3) {
      if (SMP_HIGH_TIER_EMOTES.includes(slot2)) {
        return 20;
      } else if (SMP_MID_TIER_EMOTES.includes(slot2)) {
        return 5;
      }
      return 2;
    }

    // No matches
    return 0;
  })();

  const outcome = (gambledPoints * multiplier) || -gambledPoints;

  await bot.db.updateUserPoints(username, outcome);

  const board = `| ${slot1} | ${slot2} | ${slot3} |`;
  if (outcome > 0) {
    bot.sendChatMsg(`${board} ${username} won ${outcome} points in smp EZ Clap`);
  } else {
    bot.sendChatMsg(`${board} ${username} lost ${gambledPoints} points in smp OMEGALUL`);
  }
});
