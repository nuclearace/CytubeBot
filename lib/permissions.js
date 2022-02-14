/** @typedef {import('./cytubebot.js').CytubeBot} CytubeBot */

/**
 * Checks if the user has a given permission.
 *
 * Returns true or false depending if they have that perm.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} username The user we're looking up.
 * @param {number} rank The rank the user should have.
 * @param {string=} permission The permission to look up. If not provided, will
 *     check that the user's rank is above `rank`.
 */
export async function checkPermission(bot, username, rank, permission) {
  if (permission) {
    try {
      const userPermission = userHasPermission(bot, username.toLowerCase(), permission);
      if (userPermission.hasPermission) {
        return true;
      }
    } catch (e) {
    }
  }

  const userRank = await bot.db.getUserRank(username);
  return userRank >= rank;
}

/**
 * Handles a change in hybridMods or calls sendHybridModPermissions if no
 * permission.
 *
 * Used by $permissions.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {?} data Contains the name and permission we are changing.
 */
export function handleHybridModPermissionChange(bot, data) {
  let permission = '';
  const name = data.name;

  if (data.permission) {
    permission = data.permission;
  } else {
    sendHybridModPermissions(bot, name);
    return;
  }

  const change = permission.substring(0, 1);
  permission = permission.substring(1, permission.length).trim();

  if (!(name in bot.stats.hybridMods) && change === '+') {
    bot.stats.hybridMods[name] = permission;
    bot.sendHybridModPermissions(name);
    bot.writePersistentSettings();
    return;
  } else if (change === '+' && permission === 'ALL') {
    bot.stats.hybridMods[name] = '';
    bot.stats.hybridMods[name] = permission;
    bot.writePersistentSettings();
    bot.sendHybridModPermissions(name);
    return;
  } else if (change === '-' && permission === 'ALL') {
    delete bot.stats.hybridMods[name];
    bot.writePersistentSettings();
    bot.sendHybridModPermissions(name);
    return;
  }

  const hasPermission = userHasPermission(bot, name, permission);

  if (hasPermission.hasPermission) {
    const permissions = hasPermission.permissions;
    if (change === '-' && !hasPermissionhasAll) {
      for (const permission of permissions) {
        bot.stats.hybridMods[name] = bot.stats.hybridMods[name].replace(permission, '');
      }
    }
  } else if (change === '+' && !hasPermission.hasAll) {
    // Don't add perms if user has ALL.
    bot.stats.hybridMods[name] += permission;
  }

  if (bot.stats.hybridMods[name] === '') {
    // User has no permissions.
    delete bot.stats.hybridMods[name];
  }

  bot.sendHybridModPermissions(name);
  bot.writePersistentSettings();
}

/**
 * Sends the hybridmod permissions for `name`.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} name Name to send hybridmod permissions for.
 */
export function sendHybridModPermissions(bot, name) {
  if (!name) {
    return;
  }
  bot.sendChatMsg(`${name}: ${bot.stats.hybridMods[name]}`);
}

/**
 * Checks to see if a user has permission to do something.
 *
 * @param {CytubeBot} bot Reference to the CytubeBot.
 * @param {string} name
 * @param {?} permissions The permissions we are looking for and the name of the
 *     user.
 * @return {{hasPermission: boolean, hasAll: boolean, permissions: !Array<?>}}
 */
export function userHasPermission(bot, name, permissions) {
  const returnData = {
    hasPermission: false,
    hasAll: false,
    permissions: [],
  };

  if (!bot.stats.hybridMods) {
    return returnData;
  }

  if (!(name in bot.stats.hybridMods)) {
    return returnData;
  }

  if (bot.stats.hybridMods[name].match('ALL')) {
    returnData.hasPermission = true;
    returnData.hasAll = true;
    // We found all.
    return returnData;
  }

  // Look for matching permissions for that user.
  for (const permission of permissions) {
    if (bot.stats.hybridMods[name].match(permission)) {
      returnData.permissions.push(permission);
    }
  }
  if (returnData.permissions.length !== 0) {
    returnData.hasPermission = true;
    // We found matching permissions.
    return returnData;
  }
  // We didn't find any matching permissions.
  return returnData;
}
