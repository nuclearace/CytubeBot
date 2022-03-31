import axios from 'axios';

import {errorLog} from './logger.js';

/**
 * A Twitch chat message.
 *
 * @typedef {Object} ChatMessage
 * @property {string} username Username of the user that send the message.
 * @property {string} displayName Display name of the user that sent the chat message.
 * @property {string} channel Twitch channel the message was sent in.
 * @property {string} text Text of the message
 * @property {string} timestamp Timestamp the message was sent, in ISO format. Ex:
 *    "2021-12-17T04:44:46Z"
 * @property {string} id Unique ID of the chat message.
 * @property {number} type "type" of the chat (??)
 * @property {string} raw Raw IRC message.
 * @property {!Object<string, string>} tags Additional tags on the message.
 */

/**
 * Get a random chat message for a user in a Twitch channel.
 *
 * @param {string} channel Twitch channel to look in.
 * @param {string} user User to look up.
 * @return {!Promise<ChatMessage>} A user's random chat message in the channel.
 */
export async function getRandomChat(channel, user) {
  const resp = await axios.get(`https://logs.ivr.fi/channel/${channel}/user/${user}/random`, {
    params: {
      'json': true,
    },
    validateStatus: () => true,
  });
  if (resp.status !== 200) {
    const data = JSON.stringify(resp.data);
    errorLog.log(data);
    throw new Error(`API call to TwitchLogs server failed: ${data}`);
  }

  /** @type {Array<ChatMessage>} */
  const messages = resp.data.messages;

  return messages[0];
}
