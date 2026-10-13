import { Hono } from "hono";
import type { AppEnv } from "../env";

export const activityApi = new Hono<AppEnv>();
