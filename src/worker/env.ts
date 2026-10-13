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
