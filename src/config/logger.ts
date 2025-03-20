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

// Special formatter that outputs to stderr for JSON-RPC compatibility
class StderrConsoleHandler extends log.handlers.ConsoleHandler {
  private encoder = new TextEncoder();

  override log(msg: string): void {
    // Use stderr instead of console.log
    Deno.stderr.writeSync(this.encoder.encode(msg + "\n"));
  }
}

await log.setup({
  handlers: {
    console: new StderrConsoleHandler(getLogLevel(), {
      formatter: (logRecord) => {
        return `[${logRecord.levelName}] ${logRecord.msg}`;
      },
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
