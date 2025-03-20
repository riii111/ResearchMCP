import * as log from "std/log/mod.ts";

const logLevel = Deno.env.get("LOG_LEVEL")?.toLowerCase() || "info";

function getLogLevel(): log.LevelName {
  switch (logLevel) {
    case "debug":
      return "DEBUG";
    case "info":
      return "INFO";
    case "warn":
      return "WARNING";
    case "error":
      return "ERROR";
    default:
      return "INFO";
  }
}

// Configure logger to use stderr for JSON-RPC compatibility
await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler(getLogLevel(), {
      formatter: (logRecord) => {
        return `[${logRecord.levelName}] ${logRecord.msg}`;
      },
      stderr: true,
    }),
  },
  loggers: {
    default: {
      level: getLogLevel(),
      handlers: ["console"],
    },
  },
});

const logger = log.getLogger();

export function debug(message: string): void {
  logger.debug(message);
}

export function info(message: string): void {
  logger.info(message);
}

export function warn(message: string): void {
  logger.warning(message);
}

export function error(message: string): void {
  logger.error(message);
}
