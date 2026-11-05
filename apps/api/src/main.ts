import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Photos (support tickets, offer banners) arrive as base64 JSON, so allow a few MB.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser("json", { limit: "4mb" });
  app.useBodyParser("urlencoded", { limit: "4mb", extended: true });
  app.enableCors();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();
