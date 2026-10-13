import { Hono } from "hono";
import type { AppEnv } from "../env";

export const publicApp = new Hono<AppEnv>();
