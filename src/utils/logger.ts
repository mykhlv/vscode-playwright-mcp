/**
 * Structured JSON logger that writes exclusively to stderr.
 * stdout is reserved for MCP JSON-RPC protocol — any writes there corrupt the transport.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

function emit(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: Record<string, unknown> = {
    ...data,
    ts: Date.now(),
    level,
    msg,
  };

  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug(msg: string, data?: Record<string, unknown>): void {
    emit('debug', msg, data);
  },
  info(msg: string, data?: Record<string, unknown>): void {
    emit('info', msg, data);
  },
  warn(msg: string, data?: Record<string, unknown>): void {
    emit('warn', msg, data);
  },
  error(msg: string, data?: Record<string, unknown>): void {
    emit('error', msg, data);
  },
};
