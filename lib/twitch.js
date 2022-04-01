// eslint-disable-next-line no-unused-vars
import {ApiClient, HelixChannel, HelixUser} from '@twurple/api';
import {ClientCredentialsAuthProvider} from '@twurple/auth';

/** Client to interact with the Twitch API. */
export class TwitchApiClient {
  /**
   * @param {string} clientId Twitch API client ID.
   * @param {string} clientSecret Twitch API client secret.
   */
  constructor(clientId, clientSecret) {
    this.authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret);
    this.client = new ApiClient({authProvider: this.authProvider});
  }

  /**
   * Get a channel.
   *
   * @param {string} id ID of the channel to retrieve.
   * @return {!Promise<?HelixChannel>} The channel, if found.
   */
  async getChannel(id) {
    return this.client.channels.getChannelInfo(id);
  }

  /**
   * Get a user.
   *
   * @param {string} name Username of the user to retrieve.
   * @return {!Promise<?HelixUser>} The user, if found.
   */
  async getUser(name) {
    return this.client.users.getUserByName(name);
  }

  /**
   * Check if a user is live.
   *
   * @param {string} name Username of the user to check.
   * @return {!Promise<boolean|null>} Whether the channel is live. Null if the user couldn't be
   *     found.
   */
  async isUserLive(name) {
    return this.areUsersLive([name]).then((users) => users.get(name));
  }

  /**
   * Check if multiple users are live.
   *
   * @param {!Array<string>} names Usernames of the users to check.
   * @return {!Promise<!Map<string, boolean|null>>} Whether each user is live. Null if the user
   *     couldn't be found.
   */
  async areUsersLive(names) {
    const /** @type {!Map<string, boolean|null>} */ live = new Map();

    const users = await this.client.users.getUsersByNames(names);
    for (const name of names) {
      // Will be undefined if the user wasn't found / doesn't exist.
      const twitchUser =
          users.filter((user) => user.name.toLowerCase() === name.toLowerCase()).at(0);

      live.set(name, twitchUser ? (await twitchUser.getStream()) !== null : null);
    }

    return live;
  }
}

/** Twitch channel being monitored for its live status. */
export class MonitoredTwitchChannel {
  /**
   * @param {string} id Unique ID of the channel to monitor.
   * @param {string} name Name of the channel to monitor.
   */
  constructor(id, name) {
    /**
     * Unique ID of the channel.
     * @type {string}
     */
    this.id = id;
    /**
     * Name of the channel.
     * @type {string}
     */
    this.name = name;
    /**
     * Whether the channel is live. This value may be outdated.
     *
     * Assume the channel is live until we know otherwise - that way we don't mistakenly think the
     * channel *just* went live the first time we check.
     *
     * @type {boolean}
     */
    this.live = true;
  }
}
