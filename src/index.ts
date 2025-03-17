import express from "express";
import cors from "cors";
import { ENV } from "./config/env";
import { setupRoutes } from "./routes";
import { initPaths, PUBLIC_PATH } from "./config/path";
import morgan from "morgan";
import helmet from "helmet";

const app = express();

app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin: true,
  })
);
app.use(morgan(ENV.PROD ? "combined" : "dev"));

app.use(express.static(PUBLIC_PATH));

app.get("/", (req, res) => {
  res.send("Hello World");
});

setupRoutes(app);

initPaths();

app.listen(ENV.PORT, () => {
  console.log(`Server is running on port ${ENV.PORT}`);
});
