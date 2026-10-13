import { Hono } from "hono";
import type { AppEnv } from "../env";

export const filesApi = new Hono<AppEnv>();
