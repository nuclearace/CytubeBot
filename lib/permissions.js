// Checks if the user has a given permission
// Returns true or false depending if they have that perm
// username - The user we're looking up
// rank - The rank the user should have
// permission - The permission to look up
export function checkPermission(bot, username, rank, permission, callback) {
  let hybridPerm = false;

  bot.db.getUserRank(username, (userRank) => {
    if (permission) {
      try {
        hybridPerm = userHasPermission(bot, username.toLowerCase(), permission)
                         .hasPermission;
      } catch (e) {
        hybridPerm = false;
      }
    }

    return callback(hybridPerm || userRank >= rank);
  });
}

// Used by $permissions
// Handles a change in hybridMods or calls sendHybridModPermissions if no
// permission
// is given.
// data - Contains the name and permission we are changing.
export function handleHybridModPermissionChange(bot, data) {
  let permission = '';
  const name = data.name;

  if (data.permission) {
    permission = data.permission;
  } else {
    return sendHybridModPermissions(bot, name);
  }

  const change = permission.substring(0, 1);
  permission = permission.substring(1, permission.length).trim();

  if (!(name in bot.stats.hybridMods) && change === '+') {
    bot.stats.hybridMods[name] = permission;
    bot.sendHybridModPermissions(name);
    return bot.writePersistentSettings();
  } else if (change === '+' && permission === 'ALL') {
    bot.stats.hybridMods[name] = '';
    bot.stats.hybridMods[name] = permission;
    bot.writePersistentSettings();
    return bot.sendHybridModPermissions(name);
  } else if (change === '-' && permission === 'ALL') {
    delete bot.stats.hybridMods[name];
    bot.writePersistentSettings();
    return bot.sendHybridModPermissions(name);
  }

  const hasPermission = userHasPermission(bot, name, permission);

  if (hasPermission.hasPermission) {
    const permissions = hasPermission.permissions;
    if (change === '-' && !hasPermissionhasAll) {
      for (const permission of permissions) {
        bot.stats.hybridMods[name] =
            bot.stats.hybridMods[name].replace(permission, '');
      }
    }
  } else if (change === '+' && !hasPermission.hasAll) {
    // Don't add perms if user has ALL
    bot.stats.hybridMods[name] += permission;
  }

  if (bot.stats.hybridMods[name] === '') {
    // User has no permissions
    delete bot.stats.hybridMods[name];
  }

  bot.sendHybridModPermissions(name);
  bot.writePersistentSettings();
}

// Sends the hybridmod permissions for name
// name - name to send hybridmod permissions for
export function sendHybridModPermissions(bot, name) {
  if (!name) {
    return;
  }
  bot.sendChatMsg(name + ': ' + bot.stats.hybridMods[name]);
}

// Checks to see if a user has permission to do something
// Returns an object containing: hasPermission, which will be true/false
// depending
// if the user has that permission, and permissions,
// which is an array of the permissions matched.
// bot - Reference to the current bot
// permissionData - Contains the permissions we are looking for and the name
// of the user.
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
    return returnData;  // we found all
  }

  // Look for matching permissions for that user
  for (const permission of permissions) {
    if (bot.stats.hybridMods[name].match(permission)) {
      returnData.permissions.push(permission);
    }
  }
  if (returnData.permissions.length !== 0) {
    returnData.hasPermission = true;
    return returnData;  // We found matching permissions
  }
  return returnData;  // We didn't find any matching permissions
}
