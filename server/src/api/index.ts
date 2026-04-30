import { Router } from "express";
import { healthRouter } from "./health.routes";
import { chatRouter } from "./chat.routes";
import { portfolioRouter } from "./portfolio.routes";
import { pricesRouter } from "./prices.routes";
import { chartRouter } from "./chart.routes";
import { ratesRouter } from "./rates.routes";
import { sentimentRouter } from "./sentiment.routes";
import { embedRouter } from "./embed.routes";
import { chatLimiter, dataLimiter } from "../config/rateLimits";

const pushRoutes = require("../push/pushRoutes");
const { riskRouter } = require("../engine/risk");
const monitorRoutes = require("../monitor/monitorRoutes");

export function mountApi(app: import("express").Express): void {
  app.use("/api/chat", chatLimiter);
  app.use("/api/portfolio", dataLimiter);
  app.use("/api/prices", dataLimiter);
  app.use("/api/chart", dataLimiter);
  app.use("/api/sentiment", dataLimiter);

  app.use("/", healthRouter);

  app.use("/api/chat", chatRouter);
  app.use("/api/portfolio", portfolioRouter);
  app.use("/api/prices", pricesRouter);
  app.use("/api/chart", chartRouter);
  app.use("/api/rates", ratesRouter);
  app.use("/api/sentiment", sentimentRouter);
  app.use("/api/embed", embedRouter);

  app.use("/api", pushRoutes);
  app.use("/api/risk", riskRouter);
  app.use("/api/monitor", monitorRoutes);
}

export const apiRouter: Router = Router();
