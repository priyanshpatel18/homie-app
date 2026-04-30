import express, { type Express } from "express";
import cors from "cors";
import { mountApi } from "./api";
import { requestLogger } from "./middleware/logger";
import "./types/server";

export function createServer(): Express {
  const app = express();
  app.use(requestLogger);
  app.use(cors());
  app.use(express.json());
  mountApi(app);
  return app;
}
