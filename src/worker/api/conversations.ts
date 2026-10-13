import { Hono } from "hono";
import type { AppEnv } from "../env";

export const conversationsApi = new Hono<AppEnv>();
