import {RateLimiter} from 'limiter';

/** Class handling points gambling. */
export class Gamba {
  constructor() {
    /** @type {RateLimiter} */
    this.raffleLimiter = new RateLimiter({tokensPerInterval: 1, interval: 'minute'});
    /** @type {boolean} */
    this.raffleInProgress = false;
    /** @type {!Set<string>} */
    this.usersInRaffle = new Set();
  }
}
