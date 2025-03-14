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
    options?: Omit<ServeOptions, "handler">
  ): void;
}

// Hono declarations
declare module "hono" {
  import type { Context } from "npm:hono@4.1.2";
  
  export class Hono<Env = any, BasePath extends string = "/"> {
    constructor(options?: any);
    use(middleware: any, ...path: string[]): this;
    get(path: string, ...handlers: any[]): this;
    post(path: string, ...handlers: any[]): this;
    put(path: string, ...handlers: any[]): this;
    delete(path: string, ...handlers: any[]): this;
    route(path: string, app: Hono): this;
    notFound(handler: any): this;
    onError(handler: any): this;
    fetch(request: Request, env?: Env): Promise<Response>;
  }
  
  export type { Context };
}

declare module "hono/logger" {
  export function logger(): (ctx: any, next: () => Promise<void>) => Promise<void>;
}

declare module "hono/secure-headers" {
  export function secureHeaders(): (ctx: any, next: () => Promise<void>) => Promise<void>;
}

// Neverthrow declarations
declare module "neverthrow" {
  export function ok<T, E>(value: T): Result<T, E>;
  export function err<T, E>(error: E): Result<T, E>;

  export class Result<T, E> {
    static ok<T, E>(value: T): Result<T, E>;
    static err<T, E>(error: E): Result<T, E>;
    isOk(): boolean;
    isErr(): boolean;
    map<U>(fn: (value: T) => U): Result<U, E>;
    mapErr<U>(fn: (error: E) => U): Result<T, U>;
    andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
    unwrapOr(defaultValue: T): T;
  }
}

// Zod declarations
declare module "zod" {
  export function z(): any;
  export const string: () => any;
  export const number: () => any;
  export const boolean: () => any;
  export const object: (shape: any) => any;
  export const array: (schema: any) => any;
}