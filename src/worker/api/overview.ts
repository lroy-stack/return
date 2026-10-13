import { Hono } from "hono";
import type { AppEnv } from "../env";

export const overviewApi = new Hono<AppEnv>();
