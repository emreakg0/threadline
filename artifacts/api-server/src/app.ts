import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import focus from "./routes/focus";
import { logger } from "./lib/logger";

const app: Express = express();
app.disable('x-powered-by');
app.use('/api', (_req, res, next) => {
 res.setHeader('Cache-Control', 'no-store');
 res.setHeader('X-Content-Type-Options', 'nosniff');
 res.setHeader('Referrer-Policy', 'no-referrer');
 res.setHeader('X-Frame-Options', 'DENY');
 next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", focus);
app.use('/api', (_req, res) => { res.status(404).json({error:'API route not found'}); });
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
 const code = (err as {code?:string}).code;
 const invalidJson = (err as {type?:string}).type === 'entity.parse.failed';
 logger.error({ code, type: invalidJson ? 'invalid_json' : 'request_failure' }, 'Request failed');
 res.status(invalidJson ? 400 : code === '42P01' || code?.startsWith('08') || code === 'ECONNREFUSED' ? 503 : 500).json({error: invalidJson ? 'Request body must be valid JSON.' : code === '42P01' ? 'Database schema is not ready. Run the Focus City migrations.' : 'The API could not complete this request. Check API Server logs and database availability, then retry.'});
});

export default app;
