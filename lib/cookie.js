import {DateTime, Duration} from 'luxon';

// eslint-disable-next-line no-unused-vars
import {Database} from './database.js';

export const COOKIE_CLAIM_COOLDOWN = Duration.fromObject({hours: 2}).normalize();

/** Handles cookie claiming. */
export class Cookies {
  /**
   * @param {!Database} database Reference to the database.
   */
  constructor(database) {
    /** @type {!Database} */
    this.db = database;
  }

  /**
   * Claim n cookies for a user.
   *
   * @param {string} user Username of the user to claim the cookie for.
   * @param {number} n Number of cookies to claim.
   * @return {!Promise<UserCookie>} The user's new cookie info.
   */
  async claimCookie(user, n) {
    await this.db.updateUserCookie(user, n);
    return this.getUserCookie(user);
  }

  /**
   * Get the UserCookie for a user.
   *
   * @param {string} user Username of the user to get the UserCookie for.
   * @return {!Promise<UserCookie>} The user's UserCookie.
   */
  async getUserCookie(user) {
    const count = await this.db.getUserCookieCount(user);
    const expireTimestamp = await this.db.getUserCookieLastClaimTimestamp(user);
    const expireTime = DateTime.fromSeconds(expireTimestamp || 0);
    return new UserCookie(user, count, expireTime.plus(COOKIE_CLAIM_COOLDOWN));
  }
}

/** A single user's cookie info. */
class UserCookie {
  /**
   * @param {string} user The user in question.
   * @param {number} count Number of cookies the user has.
   * @param {!DateTime} nextCookieAt When the next cookie can be claimed at.
   */
  constructor(user, count, nextCookieAt) {
    this.user = user;
    this.count = count;
    this.nextCookieAt = nextCookieAt;
  }

  /**
   * Whether a user can currently claim a cookie.
   *
   * @return {boolean} Whether a user can currently claim a cookie.
   */
  canClaimCookie() {
    return DateTime.now() >= this.nextCookieAt;
  }
}
