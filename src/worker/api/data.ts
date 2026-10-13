import { Hono } from "hono";
import type { AppEnv } from "../env";

export const dataApi = new Hono<AppEnv>();
