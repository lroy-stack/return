import type { Context } from "hono";

export interface OwnerVariables {
  ownerId: string;
  ownerEmail: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: OwnerVariables;
}

export type AppContext = Context<AppEnv>;

export function isDevelopment(env: Env): boolean {
  return env.ENVIRONMENT === "development";
}

/** `new URL(...).hostname` values that can only be reached from the developer's own machine. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
