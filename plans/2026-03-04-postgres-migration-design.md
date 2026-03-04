# Design: SQLite → Neon Postgres Migration

**Date:** 2026-03-04
**Status:** Approved

---

## Purpose

The app currently uses `better-sqlite3` with a local file DB. Vercel serverless has a read-only filesystem, causing 500 errors on every request. This migration replaces SQLite with Neon (free-tier serverless Postgres) so the app works on Vercel without any infrastructure cost.

---

## Requirements (IMMUTABLE)

1. Replace `better-sqlite3` with `@neondatabase/serverless` (Neon's HTTP-based Postgres driver — works in Vercel Edge/serverless without native binaries)
2. All existing DB operations must work identically from the caller's perspective — no changes to API routes, pipeline, or auth code
3. Full-text search must be preserved (use Postgres `tsvector`/`to_tsquery` instead of SQLite FTS5)
4. Schema must auto-migrate on startup (create tables if not exist)
5. `seedIfEmpty()` must work — seed admin user on first deploy
6. All 82 existing tests must continue to pass (mock the DB layer in tests, not the driver)
7. Single `DATABASE_URL` env var is the only new required config
8. No other env vars or infra changes required beyond `DATABASE_URL`
9. Victor will provide `DATABASE_URL` (Neon connection string). The finish stage sets it as a Vercel env var and redeploys automatically.

---

## Success Criteria (MUST ALL BE TRUE)

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] All 82 tests pass (`npm test`)
- [ ] `POST /api/auth/login` returns 200 with valid credentials on Vercel
- [ ] `GET /api/reports` returns 200 on Vercel
- [ ] `POST /api/pipeline/run` saves a report and returns `reportId`
- [ ] Full-text search returns results for matching queries
- [ ] Neon DB provisioned and `DATABASE_URL` set in Vercel automatically by the finish stage
- [ ] App deployed to `world-intelligence.vercel.app` and login works end-to-end

---

## Anti-Patterns (FORBIDDEN)

- **No Prisma or ORMs** — raw SQL only, same as current approach
- **No connection pooling config** — Neon serverless handles this; don't add pg-pool
- **No `pg` native driver** — must use `@neondatabase/serverless` (HTTP transport, works in Vercel serverless without native binaries)
- **No changes to API routes, pipeline.ts, auth.ts, or any caller of db.ts** — the migration is confined to `lib/db.ts` and test mocks
- **No manual Neon or Vercel dashboard steps** — provisioning must be fully automated in the finish stage
- **Don't drop FTS** — full-text search is a core feature; reimplement with `tsvector`

---

## Approach

1. **Swap the driver:** Replace `better-sqlite3` with `@neondatabase/serverless`. The Neon serverless driver uses HTTP/WebSocket — no native binaries, works in Vercel Edge.
2. **Rewrite `lib/db.ts`:** Translate all queries from SQLite syntax to Postgres. The public API (function signatures, return types) stays identical.
3. **Schema:** Use `CREATE TABLE IF NOT EXISTS` + a `tsvector` column on `reports` for FTS. Add a `GIN` index on it. Replace FTS5 triggers with a Postgres function + trigger that updates `search_vector` on insert/update.
4. **Tests:** Tests currently mock `better-sqlite3`. Update mocks to mock `@neondatabase/serverless` instead. No test logic changes needed.
5. **Provisioning script:** `scripts/provision-neon.ts` — calls Neon API to create project + DB, writes `DATABASE_URL` to Vercel env vars, then redeploys.

---

## Architecture

### Files changed
- `lib/db.ts` — full rewrite (driver swap + Postgres SQL)
- `package.json` — remove `better-sqlite3` + `@types/better-sqlite3`, add `@neondatabase/serverless`
- `scripts/provision-neon.ts` — new: provision Neon DB + set Vercel env var
- Test files that mock `better-sqlite3` — update mock target

### Schema (Postgres equivalent)

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_provider TEXT NOT NULL DEFAULT 'anthropic',
  triage_model TEXT NOT NULL DEFAULT 'gemini-1.5-flash-8b',
  synthesis_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  triage_fallbacks TEXT NOT NULL DEFAULT '[]',
  synthesis_fallbacks TEXT NOT NULL DEFAULT '[]',
  schedule_hours INTEGER NOT NULL DEFAULT 6,
  category_config TEXT NOT NULL DEFAULT '{}',
  providers TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  schedule TEXT NOT NULL,
  categories TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  triage_model TEXT NOT NULL,
  synthesis_model TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  search_vector tsvector
);

CREATE INDEX IF NOT EXISTS reports_fts_idx ON reports USING GIN(search_vector);
```

FTS trigger:
```sql
CREATE OR REPLACE FUNCTION reports_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.body,'') || ' ' || coalesce(NEW.summary,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER reports_search_vector_trigger
BEFORE INSERT OR UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION reports_search_vector_update();
```

### Key API translation

| SQLite | Postgres |
|--------|----------|
| `db.prepare(sql).get(...)` | `await neon(sql, [...params])` → `rows[0]` |
| `db.prepare(sql).all(...)` | `await neon(sql, [...params])` → `rows` |
| `db.prepare(sql).run(...)` | `await neon(sql, [...params])` |
| `INSERT OR REPLACE` | `INSERT ... ON CONFLICT DO UPDATE` |
| FTS5 MATCH | `search_vector @@ to_tsquery(...)` |
| Named params `@id` | Positional params `$1, $2, ...` |

### `db.ts` public API (unchanged)
```typescript
export function getUser(username: string): User | undefined
export async function createUser(username: string, password: string): Promise<void>
export function getConfig(): Record<string, unknown>        // → async
export function saveConfig(updates: Record<string, unknown>): void  // → async
export function getActiveCategoryConfig(): Record<string, ...>  // → async
export function saveReport(report: Report): void            // → async
export function getReport(id: string): Report | null        // → async
export function getReports(limit: number, offset: number): Report[]  // → async
export function searchReports(query: string, limit: number): Report[]  // → async
export async function seedIfEmpty(): Promise<void>
```

Note: synchronous functions become async. Callers already use `await` on `seedIfEmpty` and `createUser`. The other functions (`getConfig`, `saveReport`, etc.) are called in API routes — those routes are already async, so adding `await` is a trivial mechanical change. This is the one caller-side change required and is acceptable.

### Provisioning (`scripts/provision-neon.ts`)
1. Call `GET https://console.neon.tech/api/v2/projects` — check if `world-intelligence` project exists
2. If not: `POST /api/v2/projects` to create it
3. Get connection string from response
4. `PATCH /api/vercel/v10/projects/.../env` to set `DATABASE_URL` in production
5. Trigger `vercel deploy --prod`

---

## Design Rationale

**Why Neon over Vercel Postgres?** Both use Neon under the hood. Using Neon directly gives us the Neon API for automated provisioning. Vercel Postgres requires clicking through the dashboard — not automatable with the Vercel token we have.

**Why `@neondatabase/serverless` over `pg`?** The standard `pg` driver uses TCP + native binaries. Vercel serverless functions can't use TCP connections in Edge runtime. `@neondatabase/serverless` uses HTTP (fetch-based) and works everywhere.

**Why keep raw SQL?** The codebase is small and the queries are simple. Adding an ORM (Prisma, Drizzle) adds build complexity, generated files, and migration files. Raw SQL with Postgres is battle-tested and the schema won't change often.

**Why make previously-sync functions async?** Neon's serverless driver is async-only (HTTP under the hood). The sync SQLite API was a convenient fiction — Postgres requires proper async. The callers are already in async contexts so this is safe.

---

## Provisioning Note (updated)

Vercel's Postgres API is not accessible via the deploy token. Instead:

1. Victor creates a free Neon project at https://console.neon.tech (30 seconds, no credit card)
2. Copies the connection string (format: `postgres://user:pass@host/dbname?sslmode=require`)
3. Provides it — finish stage sets `DATABASE_URL` as Vercel env var and redeploys

The `scripts/provision-neon.ts` in the original design is replaced by a simple `scripts/set-db-url.sh` that accepts `DATABASE_URL` as an argument and calls the Vercel env API.
