#!/usr/bin/env node

const defaults = {
  baseUrl: process.env.SMOKE_BASE_URL || "http://127.0.0.1:4300",
  path: process.env.SMOKE_PATH || "/health/ready",
  timeoutMs: Number(process.env.SMOKE_TIMEOUT_MS || 60_000),
  intervalMs: Number(process.env.SMOKE_INTERVAL_MS || 2_000),
  requestTimeoutMs: Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 5_000),
  expectedRelease: process.env.SMOKE_EXPECTED_RELEASE || "",
};

function usage() {
  console.log(`Usage: node scripts/smoke-check.mjs [options]

Options:
  --base-url URL             Service origin (default: ${defaults.baseUrl})
  --path PATH                Readiness path (default: ${defaults.path})
  --timeout-ms NUMBER        Overall retry deadline (default: ${defaults.timeoutMs})
  --interval-ms NUMBER       Delay between attempts (default: ${defaults.intervalMs})
  --request-timeout-ms N     Per-request deadline (default: ${defaults.requestTimeoutMs})
  --expected-release SHA     Require the JSON response release field to match
  --help                     Show this help

The command exits successfully only after the endpoint returns HTTP 2xx and,
when supplied, its JSON release field matches --expected-release.`);
}

function readArguments(argv) {
  const options = { ...defaults };
  const mappings = new Map([
    ["--base-url", "baseUrl"],
    ["--path", "path"],
    ["--timeout-ms", "timeoutMs"],
    ["--interval-ms", "intervalMs"],
    ["--request-timeout-ms", "requestTimeoutMs"],
    ["--expected-release", "expectedRelease"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    }

    const key = mappings.get(argument);
    if (!key) throw new Error(`Unknown option: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    options[key] = key.endsWith("Ms") ? Number(value) : value;
    index += 1;
  }

  return options;
}

function validateOptions(options) {
  const baseUrl = new URL(options.baseUrl);
  if (!new Set(["http:", "https:"]).has(baseUrl.protocol)) {
    throw new Error("--base-url must use http or https");
  }
  if (!String(options.path).startsWith("/")) throw new Error("--path must start with /");

  for (const key of ["timeoutMs", "intervalMs", "requestTimeoutMs"]) {
    if (!Number.isFinite(options[key]) || options[key] <= 0) {
      throw new Error(`${key} must be a positive number`);
    }
  }

  return new URL(options.path, baseUrl).toString();
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function run() {
  const options = readArguments(process.argv.slice(2));
  const endpoint = validateOptions(options);
  const deadline = Date.now() + options.timeoutMs;
  let attempt = 0;
  let lastFailure = "No request was made";

  console.log(`Waiting for smoke target: ${endpoint}`);

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      });
      const body = (await response.text()).slice(0, 500);

      if (response.ok) {
        let releaseMatches = true;
        if (options.expectedRelease) {
          let payload;
          try {
            payload = JSON.parse(body);
          } catch {
            lastFailure = `HTTP ${response.status} returned non-JSON while checking release`;
            releaseMatches = false;
          }

          if (releaseMatches && payload?.release !== options.expectedRelease) {
            lastFailure = `release mismatch: expected ${options.expectedRelease}, received ${payload?.release || "missing"}`;
            releaseMatches = false;
          }
        }

        if (releaseMatches) {
          console.log(`Smoke check passed on attempt ${attempt} (${response.status})`);
          return;
        }
      } else {
        lastFailure = `HTTP ${response.status}: ${body || response.statusText}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    const remaining = deadline - Date.now();
    if (remaining > 0) await sleep(Math.min(options.intervalMs, remaining));
  }

  throw new Error(`Smoke check failed after ${attempt} attempts: ${lastFailure}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
