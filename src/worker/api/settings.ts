import { Hono } from "hono";
import type { AppEnv } from "../env";

export const settingsApi = new Hono<AppEnv>();
