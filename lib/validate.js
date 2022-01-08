import {youTubeLookup} from './apiclient.js';
import {syslog} from './logger.js';

/** @typedef {import('./cytubebot.js').CytubeBot} CytubeBot */

/**
 * Validity data about a YouTube video.
 *
 * @typedef {Object} YouTubeVideoValidity
 * @property {boolean} valid Whether the video is valid.
 * @property {?string} invalidReason If the video's invalid, the reason for it.
 */

/**
 * Validate a YouTube video.
 *
 * @param {CytubeBot} bot Reference to the bot.
 * @param {string} id ID of the video.
 * @param {string} type Type of the video (?)
 * @param {string} title Title of the video.
 * @return {!Promise<YouTubeVideoValidity>} Validity data.
 */
export async function validateYouTubeVideo(bot, id, type, title) {
  if (!bot.youtubeapi) {
    return {valid: false};
  }

  syslog.log(`!~~~! Looking up youtube info for: ${id}`);

  const vidInfo = await youTubeLookup(id, bot.youtubeapi);
  if (!vidInfo) {
    if (title) {
      bot.db.flagVideo(type, id, 1, title);
    }
    return {valid: true, reason: 'invalid'};
  }

  let blocked = false;
  let allowed = {};
  let shouldDelete = false;

  // See what countries are blocked.
  try {
    blocked = vidInfo.contentDetails.regionRestriction.blocked;
  } catch (e) {
    blocked = false;
  }

  // See what countries are allowed to embed the video.
  try {
    allowed = vidInfo.contentDetails.regionRestriction.allowed;
  } catch (e) {
    allowed = false;
  }

  // Should we delete the video?
  if (bot.deleteIfBlockedIn) {
    if (allowed && allowed.indexOf(bot.deleteIfBlockedIn) === -1) {
      shouldDelete = true;
    } else if (blocked && blocked.indexOf(bot.deleteIfBlockedIn) !== -1) {
      shouldDelete = true;
    }
  }

  if (!vidInfo.status.embeddable) {
    if (title) {
      bot.db.flagVideo(type, id, 1, title);
    }
    return {valid: true, reason: 'disabled'};
  } else if (shouldDelete) {
    if (title) {
      bot.db.flagVideo(type, id, 1, title);
    }
    return {valid: true, reason: 'blocked'};
  } else {
    return {valid: true};
  }
}
