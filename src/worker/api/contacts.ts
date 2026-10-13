import { Hono } from "hono";
import type { AppEnv } from "../env";

export const contactsApi = new Hono<AppEnv>();
