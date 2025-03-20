import * as log from "std/log/mod.ts";

// Initialization flags
let isInitialized = false;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

// Create TextEncoder instance once
const encoder = new TextEncoder();

function initializeLogger(): Promise<void> {
  if (isInitialized) {
    return Promise.resolve();
  }

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;

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

  class StderrConsoleHandler extends log.handlers.ConsoleHandler {
    override log(msg: string): void {
      Deno.stderr.writeSync(encoder.encode(msg + "\n"));
    }
  }

  // Setup logger
  log.setup({
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

  // Create promise to handle initialization
  initPromise = Promise.resolve().then(() => {
    isInitialized = true;
    isInitializing = false;
  });

  return initPromise;
}

function getLoggerSafe(): log.Logger {
  if (!isInitialized && !isInitializing) {
    initializeLogger().catch((e) => {
      console.error("Logger initialization failed:", e);
    });
  }
  return log.getLogger();
}

export function debug(message: string): void {
  getLoggerSafe().debug(message);
}

export function info(message: string): void {
  getLoggerSafe().info(message);
}

export function warn(message: string): void {
  getLoggerSafe().warning(message);
}

export function error(message: string): void {
  getLoggerSafe().error(message);
}
