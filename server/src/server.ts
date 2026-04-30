import express, { type Express } from "express";
import cors from "cors";
import { mountApi } from "./api";

export function createServer(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  mountApi(app);
  return app;
}
