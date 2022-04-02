import {RateLimiter} from 'limiter';
import {DateTime, Duration} from 'luxon';

/** Class handling points gambling. */
export class Gamba {
  constructor() {
    /** @type {RateLimiter} */
    this.raffleLimiter = new RateLimiter({tokensPerInterval: 1, interval: 'minute'});
    /** @type {boolean} */
    this.raffleInProgress = false;
    /** @type {!Set<string>} */
    this.usersInRaffle = new Set();

    /** @type {!Array<!PendingDuel>} */
    this.pendingDuels = [];
    this.startWatchingForDuelExpiration();
  }

  startWatchingForDuelExpiration() {
    const checkIntervalSeconds = 1;
    setInterval(() => {
      this.pendingDuels = this.pendingDuels.filter((duel) => DateTime.now() < duel.expireTime);
    }, checkIntervalSeconds * 1_000);
  }
}

/** A duel that hasn't yet been accepted. */
export class PendingDuel {
  static EXPIRE_AFTER = Duration.fromObject({seconds: 30});

  /**
   * @param {string} initiator Username of the initiator of the duel.
   * @param {string} target Username of the target of the duel.
   * @param {number} amount Amount of points in the duel.
   */
  constructor(initiator, target, amount) {
    this.initiator = initiator;
    this.target = target;
    this.amount = amount;
    this.expireTime = DateTime.now().plus(PendingDuel.EXPIRE_AFTER);
  }
}
