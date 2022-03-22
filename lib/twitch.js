import {ApiClient} from '@twurple/api';
import {ClientCredentialsAuthProvider} from '@twurple/auth';

/** Class to interact with the Twitch API. */
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
   * Check if a channel is live.
   *
   * @param {string} userName Username of the channel to check.
   * @return {!Promise<boolean>} Whether the channel is live.
   */
  async isChannelLive(userName) {
    const user = await this.client.users.getUserByName(userName);
    if (!user) {
      return false;
    }

    return (await user.getStream()) !== null;
  }
}
