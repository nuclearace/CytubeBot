import {ApiClient} from '@twurple/api';
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
   * @param {string} channel Username of the channel to check.
   * @return {!Promise<?Channel>} Whether the channel is live.
   */
  async getChannel(channel) {
    return this.client.users.getUserByName(channel);
  }

  /**
   * Check if a channel is live.
   *
   * @param {string} channel Username of the channel to check.
   * @return {!Promise<boolean>} Whether the channel is live.
   */
  async isChannelLive(channel) {
    const user = await this.client.users.getUserByName(channel);
    if (!user) {
      return false;
    }

    return (await user.getStream()) !== null;
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
