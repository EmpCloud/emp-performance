# EMP Performance production runbook

This runbook describes the supported release process for EMP Performance. The
GitHub deployment workflow currently targets a Linux host managed by PM2. The
Dockerfiles are also validated in CI and can be used by a container platform,
but they are not mixed into the PM2 release process.

## Release invariants

- Only a commit from `main` whose `CI` workflow succeeded can deploy.
- Each release is a detached Git worktree identified by the full commit SHA and
  GitHub Actions run ID.
- Dependencies are installed from `pnpm-lock.yaml` with `--frozen-lockfile`.
- Module migrations run once as a release step before PM2 reloads the service.
- The service is accepted only when `/health/ready` returns HTTP 2xx.
- The `current` symlink changes only after readiness succeeds.
- An application rollback never automatically rolls back database migrations.
  Every production migration must therefore remain compatible with the previous
  application release.

## GitHub environment configuration

Create a protected GitHub environment named `test`. Require reviewers for that
environment if deployments need human approval.

Required environment secrets:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_HOST` | SSH host name or IP address |
| `DEPLOY_USER` | Restricted deployment account |
| `DEPLOY_SSH_KEY` | Private key dedicated to this deployment |
| `DEPLOY_HOST_FINGERPRINT` | SHA256 fingerprint of the SSH host key |

Optional secrets:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_PORT` | SSH port; defaults to `22` |
| `DEPLOY_SSH_KEY_PASSPHRASE` | Passphrase for the deployment key |

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEPLOY_PATH` | `/home/empcloud-development/empcloud-projects/emp-performance` | Existing Git clone used to fetch releases |
| `DEPLOY_RELEASES_PATH` | `<DEPLOY_PATH>-releases` | Immutable release worktrees |
| `DEPLOY_CURRENT_LINK` | `<DEPLOY_PATH>-current` | Symlink to the last healthy release |
| `DEPLOY_ENV_FILE` | `<DEPLOY_PATH>/.env` | Shared production environment file |
| `DEPLOY_HEALTH_URL` | `http://127.0.0.1:4300` | Origin used by the readiness smoke check |
| `DEPLOY_PUBLIC_URL` | none | Public URL displayed by GitHub |
| `PM2_APP_NAME` | `emp-performance` | PM2 process name |
| `PM2_INSTANCES` | `1` | Process count; keep at one until worker scaling is explicitly tested |

Do not use an administrator's personal SSH key. Restrict the deployment key and
account to this host and application directory. Verify the host fingerprint
out of band before storing it in GitHub.

## Host prerequisites

Install Node.js 20, Corepack, Git, and PM2. The deployment user must be able to:

1. Fetch `origin/main` from the repository.
2. Create sibling release worktrees.
3. Read the shared environment file.
4. Manage only the `emp-performance` PM2 process.

The repository at `DEPLOY_PATH` is a fetch source; the workflow does not modify
its branch, discard changes, or stash files. Keep its `origin` credentials
non-interactive.

Create the production environment file outside release worktrees and restrict
it to the deployment account:

```sh
cp .env.example /secure/path/emp-performance.env
chmod 600 /secure/path/emp-performance.env
```

Set `DEPLOY_ENV_FILE` to that path. At minimum, production configuration should
include:

```env
NODE_ENV=production
APP_URL=https://performance.example.com
CORS_ORIGIN=https://performance.example.com

RUN_MIGRATIONS_ON_STARTUP=false
RUN_EMPCLOUD_MIGRATIONS_ON_STARTUP=false
REDIS_REQUIRED=true
SHUTDOWN_TIMEOUT_MS=30000
DEPENDENCY_TIMEOUT_MS=3000
TRUST_PROXY=1
JOB_TIMEZONE=Asia/Kolkata
API_DOCS_ENABLED=false
DETAILED_HEALTH_ENABLED=false

VITE_API_URL=/api/v1
VITE_SSO_LOGIN_URL=https://cloud.example.com/sso/emp-performance
VITE_EMPCLOUD_RETURN_ORIGINS=https://cloud.example.com
```

`RELEASE_SHA` is injected by the deployment workflow. Configure database, SSO,
Redis, webhook, and SMTP secrets as documented in `.env.example`. The shared
EMP Cloud identity schema must be provisioned by its owning service; this
module should not mutate it during normal production startup.

## Release sequence

Merging to `main` starts `CI`. CI must complete all of the following:

1. Frozen dependency installation.
2. Production dependency audit with no high or critical findings.
3. TypeScript and application builds.
4. Module migration execution against MySQL.
5. The curated CI test suite.
6. Production server and client Docker image builds.

`pnpm test:ci` is the deterministic release suite. Historical coverage-push
mocks, developer-machine database suites, and HTTP tests that previously
defaulted to an external environment are isolated behind `pnpm test:all` until
their fixtures are modernized. They must never be reintroduced to the release
gate with skip-on-error behavior; promote them individually only after they are
self-contained and repeatable.

After CI succeeds, `.github/workflows/deploy.yml`:

1. Fetches and verifies the exact successful commit on the host.
2. Creates a new detached release worktree.
3. Links the protected environment file into that worktree.
4. Installs locked dependencies and builds all packages.
5. Runs the compiled release artifact with `pnpm db:migrate:prod`.
6. Uses `pm2 startOrReload` with `scripts/pm2.ecosystem.cjs`.
7. Polls `/health/ready` for up to 90 seconds.
8. Updates the `current` symlink and persists PM2 state only after success.

Inspect a release after deployment:

```sh
pm2 describe emp-performance
pm2 logs emp-performance --lines 200
readlink -f /path/to/emp-performance-current
curl --fail --show-error http://127.0.0.1:4300/health/live
curl --fail --show-error http://127.0.0.1:4300/health/ready
```

The cross-platform smoke check can also be run from the repository:

```sh
pnpm smoke -- --base-url http://127.0.0.1:4300 --path /health/ready
```

## Database changes and backups

Before approving a release that contains migrations:

1. Confirm the migration is additive or otherwise backward compatible with the
   currently running application.
2. Take and verify a MySQL backup using the organization's managed database
   backup process.
3. Record the backup identifier in the change ticket.
4. Test the migration on a recent sanitized restore before production.

Do not invoke Knex `down` migrations automatically during an incident. Some
schema changes cannot be reversed without losing valid production data. Prefer
rolling the application back while leaving forward-compatible schema in place.
Use database restore only as a separately approved recovery action.

## Rollback

If PM2 reload or readiness verification fails, the workflow automatically
reloads the previous release and verifies readiness again. The `current`
symlink is not moved before the new release passes.

For a manual application rollback:

1. Identify a known-good release under `DEPLOY_RELEASES_PATH`.
2. Confirm that its code is compatible with all migrations already applied.
3. Reload it using the checked-in ecosystem definition:

```sh
cd /path/to/a/recent/release
RELEASE_DIR=/path/to/known-good-release \
RELEASE_SHA=<known-good-sha> \
PM2_APP_NAME=emp-performance \
PM2_INSTANCES=1 \
pm2 startOrReload scripts/pm2.ecosystem.cjs --only emp-performance --update-env

node scripts/smoke-check.mjs \
  --base-url http://127.0.0.1:4300 \
  --path /health/ready \
  --timeout-ms 90000

node scripts/smoke-check.mjs \
  --base-url http://127.0.0.1:4300 \
  --path /health/live \
  --expected-release <known-good-sha> \
  --timeout-ms 30000
```

4. After readiness succeeds, update the `current` symlink and run `pm2 save`.
5. Record the failed and restored SHAs and preserve logs for investigation.

## Container deployment

Build the separately deployable images from the repository root:

```sh
docker build -f docker/Dockerfile.server -t emp-performance-server:<sha> .
docker build \
  -f docker/Dockerfile.client \
  --build-arg VITE_API_URL=/api/v1 \
  --build-arg VITE_SSO_LOGIN_URL=https://cloud.example.com/sso/emp-performance \
  --build-arg VITE_EMPCLOUD_RETURN_ORIGINS=https://cloud.example.com \
  -t emp-performance-client:<sha> .
```

The server image health check calls `/health/ready`. The client image checks
its independent `/frontend-health` endpoint. A container platform must provide
the `performance-server` DNS name used by the bundled Nginx proxy, inject server
environment variables as secrets, run
`node packages/server/dist/server/src/db/migrate.js` (or the equivalent
`pnpm db:migrate:prod` script when workspace metadata is present) from the server image as a
release job, and wait for readiness before sending traffic.

## Incident checklist

1. Stop further deployments with the GitHub environment protection rule.
2. Check `/health/live` and `/health/ready` separately.
3. Inspect PM2 restart count and logs.
4. Verify both MySQL dependencies and Redis according to `REDIS_REQUIRED`.
5. Check the release SHA reported by health diagnostics.
6. Roll back only the application unless database recovery is explicitly
   approved.
7. Capture timeline, affected organizations, release SHA, migration state, and
   recovery action in the incident record.
