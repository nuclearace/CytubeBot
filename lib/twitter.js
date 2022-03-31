import {TwitterApi} from 'twitter-api-v2';

/** @typedef {import('twitter-api-v2').TweetV2} TweetV2 */
/** @typedef {import('twitter-api-v2').TwitterApiReadOnly} TwitterApiReadOnly */
/** @typedef {import('twitter-api-v2').UserV2} UserV2 */

/** Class for interacting with the Twitter API. */
export class TwitterClient {
  /**
   * @param {string} bearerToken Twitter API bearer token.
   */
  constructor(bearerToken) {
    /** @type {!TwitterApiReadOnly} */
    this.twitterClient = new TwitterApi(bearerToken).readOnly;
  }

  /**
   * Retrieve a user's last tweet.
   *
   * Uses 5 Tweets worth of quota per call.
   *
   * @param {!UserV2} user Twitter user to retrieve the last tweet of.
   * @return {!Promise<!TweetV2|null>} The user's last tweet.
   */
  async getLastTweet(user) {
    const timeline = await this.twitterClient.v2.userTimeline(user.id, {
      'max_results': 5,
      'tweet.fields': ['created_at', 'text'],
    });
    return timeline.tweets[0];
  }

  /**
   * Retrieve a Twitter user.
   *
   * @param {string} userName Name of the user to retrieve.
   * @return {!Promise<!UserV2|null>} The user.
   */
  async getUser(userName) {
    const result = await this.twitterClient.v2.userByUsername(userName);
    return result.data;
  }
}
