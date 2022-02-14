export const AUDIT_LOG_FILE_NAME = 'audit.log';
export const ERROR_LOG_FILE_NAME = 'error.log';
export const INFO_LOG_FILE_NAME = 'info.log';
export const MONITOR_ERROR_LOG_FILE_NAME = 'monitor_error.log';
export const RESTART_TIMES_FILE_NAME = 'times_restarted.txt';

export const MAX_RESTARTS = 30;

export class Rank {
  static FOUNDER = 5;
  static OWNER = 4;
  static ADMIN = 3;
  static MOD = 2;
  static REGISTERED = 1;
  static UNREGISTERED = 0;
}
