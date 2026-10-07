import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Run on a persistent host/process manager, not inside the browser or a
// serverless process that ends when a page request completes.
export function workerConfig(env) {
  const target = new URL(env.WHATSAPP_APP_URL);
  if (
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/"
  ) {
    throw new Error(
      "WHATSAPP_APP_URL must be an origin without credentials or a path.",
    );
  }
  if (
    target.protocol !== "https:" &&
    !(
      target.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
    )
  ) {
    throw new Error("The worker requires HTTPS except on localhost.");
  }
  const secret = env.WHATSAPP_WORKER_SECRET;
  if (!secret || secret.length < 32 || /\s/.test(secret))
    throw new Error(
      "Set a random WHATSAPP_WORKER_SECRET of at least 32 characters.",
    );
  return { url: new URL("/api/whatsapp/worker", target), secret };
}

export async function tick(config, request = fetch) {
  const response = await request(config.url, {
    headers: { Authorization: `Bearer ${config.secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) throw new Error(`Worker HTTP ${response.status}`);
  const result = await response.json();
  if (
    typeof result.enabled !== "boolean" ||
    !Number.isInteger(result.processed)
  )
    throw new Error("Unexpected worker response.");
  return { enabled: result.enabled, processed: result.processed };
}

async function main() {
  const config = workerConfig(process.env),
    stop = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => stop.abort());
  do {
    try {
      const result = await tick(config);
      console.log(
        JSON.stringify({ time: new Date().toISOString(), ...result }),
      );
    } catch (e) {
      console.error(
        e instanceof Error && /^Worker HTTP \d+$/.test(e.message)
          ? e.message
          : "Worker unavailable; retrying later.",
      );
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (process.argv.includes("--once") || stop.signal.aborted) break;
    try {
      await delay(10_000, undefined, { signal: stop.signal });
    } catch {
      break;
    }
  } while (!stop.signal.aborted);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error("Invalid worker configuration; check the deployment guide.");
    process.exitCode = 1;
  });
}
