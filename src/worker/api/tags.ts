import { Hono } from "hono";
import type { AppEnv } from "../env";

export const tagsApi = new Hono<AppEnv>();
