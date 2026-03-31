import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
  }),
});

// ── Auth events ──────────────────────────────────────────────────────────────

export function logAuthLogin(userId: string, email: string, ip: string | undefined) {
  logger.info({ event: 'auth.login', userId, email, ip });
}

export function logAuthLoginFailed(email: string, ip: string | undefined, reason: string) {
  logger.warn({ event: 'auth.login_failed', email, ip, reason });
}

export function logAuthLoginLocked(email: string, ip: string | undefined, retryAfterSecs: number) {
  logger.warn({ event: 'auth.login_locked', email, ip, retryAfterSecs });
}

export function logAuthRegister(userId: string, email: string, ip: string | undefined) {
  logger.info({ event: 'auth.register', userId, email, ip });
}

export function logAuthLogout(userId: string, ip: string | undefined) {
  logger.info({ event: 'auth.logout', userId, ip });
}

export function logAuthTokenRevoked(userId: string, ip: string | undefined) {
  logger.warn({ event: 'auth.token_revoked', userId, ip });
}

export default logger;
