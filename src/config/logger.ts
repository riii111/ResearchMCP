/**
 * Logging utility
 * Output to stderr to avoid interfering with JSON-RPC
 */

const encoder = new TextEncoder();

export function info(message: string): void {
  Deno.stderr.writeSync(encoder.encode(`[INFO] ${message}\n`));
}

export function warn(message: string): void {
  Deno.stderr.writeSync(encoder.encode(`[WARN] ${message}\n`));
}

export function error(message: string): void {
  Deno.stderr.writeSync(encoder.encode(`[ERROR] ${message}\n`));
}

export function debug(message: string): void {
  Deno.stderr.writeSync(encoder.encode(`[DEBUG] ${message}\n`));
}
