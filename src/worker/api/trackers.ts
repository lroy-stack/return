import { Hono } from "hono";
import type { AppEnv } from "../env";

export const trackersApi = new Hono<AppEnv>();
