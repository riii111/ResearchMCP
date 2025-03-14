// Type definitions for Deno API
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): { [key: string]: string };
  }

  export const env: Env;

  export function exit(code?: number): never;

  export interface ServeOptions {
    port?: number;
    hostname?: string;
    handler?: (request: Request) => Response | Promise<Response>;
    onListen?: (params: { hostname: string; port: number }) => void;
    signal?: AbortSignal;
  }

  export function serve(options: ServeOptions): void;
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
    options?: Omit<ServeOptions, "handler">,
  ): void;
}

// Hono declarations
declare module "hono" {
  import type { Context } from "npm:hono@4.1.2";

  export type MiddlewareHandler<T = unknown> = (
    ctx: Context,
    next: () => Promise<void>,
  ) => Promise<T | void>;
  export type Handler<T = unknown> = (
    ctx: Context,
  ) => Promise<T | Response | void> | T | Response | void;

  export class Hono<Env = Record<string, unknown>, BasePath extends string = "/"> {
    constructor(options?: { strict?: boolean });
    use(middleware: MiddlewareHandler, ...path: string[]): this;
    get(path: string, ...handlers: Handler[]): this;
    post(path: string, ...handlers: Handler[]): this;
    put(path: string, ...handlers: Handler[]): this;
    delete(path: string, ...handlers: Handler[]): this;
    route(path: string, app: Hono): this;
    notFound(handler: Handler): this;
    onError(handler: (err: Error, ctx: Context) => Response | Promise<Response>): this;
    fetch(request: Request, env?: Env): Promise<Response>;
  }

  export type { Context };
}

declare module "hono/logger" {
  import type { Context } from "npm:hono@4.1.2";
  export function logger(): (ctx: Context, next: () => Promise<void>) => Promise<void>;
}

declare module "hono/secure-headers" {
  import type { Context } from "npm:hono@4.1.2";
  export function secureHeaders(): (ctx: Context, next: () => Promise<void>) => Promise<void>;
}

// Neverthrow declarations
declare module "neverthrow" {
  export function ok<T, E>(value: T): Result<T, E>;
  export function err<T, E>(error: E): Result<T, E>;

  export class Result<T, E> {
    static ok<T, E>(value: T): Result<T, E>;
    static err<T, E>(error: E): Result<T, E>;

    readonly value: T;
    readonly error: E;

    isOk(): this is Ok<T, E>;
    isErr(): this is Err<T, E>;

    map<U>(fn: (value: T) => U): Result<U, E>;
    mapErr<U>(fn: (error: E) => U): Result<T, U>;
    andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
    unwrapOr(defaultValue: T): T;

    match<R>(okFn: (value: T) => R, errFn: (error: E) => R): R;
    _unsafeUnwrap(): T;
    _unsafeUnwrapErr(): E;
  }

  export class Ok<T, E> extends Result<T, E> {
    constructor(value: T);
    readonly value: T;
    isOk(): this is Ok<T, E>;
    isErr(): this is Err<T, E>;
  }

  export class Err<T, E> extends Result<T, E> {
    constructor(error: E);
    readonly error: E;
    isOk(): this is Ok<T, E>;
    isErr(): this is Err<T, E>;
  }
}

// Zod declarations
declare module "zod" {
  export interface ZodType<T> {
    parse(data: unknown): T;
    safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown };
  }

  export function z(): ZodType<unknown>;

  export const string: () => ZodType<string>;
  export const number: () => ZodType<number>;
  export const boolean: () => ZodType<boolean>;
  export const object: <T extends Record<string, ZodType<unknown>>>(
    shape: T,
  ) => ZodType<{ [K in keyof T]: T[K] extends ZodType<infer U> ? U : never }>;
  export const array: <T>(schema: ZodType<T>) => ZodType<T[]>;
}
