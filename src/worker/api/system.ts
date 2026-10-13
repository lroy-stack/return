import { Hono } from "hono";
import type { AppEnv } from "../env";

export const systemApi = new Hono<AppEnv>();
