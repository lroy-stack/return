import { Hono } from "hono";
import type { AppEnv } from "../env";

export const recoveriesApi = new Hono<AppEnv>();
