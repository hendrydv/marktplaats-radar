import { scheduled } from "./scheduler";
import type { Env } from "./types";
import { handleRequest } from "./web/api";

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
  scheduled,
} satisfies ExportedHandler<Env>;
