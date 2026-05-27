# Noon Financial — NestJS API

REST API backend for Noon marketplace financial management.
Runs alongside the existing Flask app during migration.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| ORM | Prisma 5 |
| Database | PostgreSQL (Neon recommended for Vercel) |
| Auth | JWT (access + refresh), argon2 hashing |
| Validation | class-validator + class-transformer |
| Docs | Swagger (`/api/docs`) |
| Rate limiting | @nestjs/throttler |
| Security | helmet, CORS |

---

## Database choice: PostgreSQL vs Turso

The Flask app uses **Turso/libSQL** for its Vercel deployment.
This API uses **PostgreSQL** instead:

- Prisma's libSQL adapter does **not** support `prisma migrate dev` — no schema diffing, no migration history
- PostgreSQL has first-class Prisma support with full tooling (`prisma studio`, `migrate`, etc.)
- Turso remains the Flask app's database during the parallel operation period
- For Vercel deployment use **[Neon](https://neon.tech)** (serverless Postgres, free 512 MB tier, zero cold-start)

---

## Setup

### 1. Install dependencies

```bash
cd nestjs-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/noon_dev"

JWT_SECRET="generate-with: openssl rand -hex 32"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="different-secret: openssl rand -hex 32"
JWT_REFRESH_EXPIRES_IN="7d"

PORT=3000
NODE_ENV=development
CORS_ORIGINS="http://localhost:5000"
```

### 3. Run database migrations

```bash
npm run db:migrate    # creates tables + generates Prisma client
```

### 4. Seed the database

```bash
npm run db:seed
```

Creates:
- Organization: `Default Organization`
- Admin user: `admin` / `Admin@12345`

**Change the default password immediately.**

### 5. Start dev server

```bash
npm run start:dev
```

API: `http://localhost:3000/api/v1`
Swagger: `http://localhost:3000/api/docs`

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Min 32 chars, used for access tokens |
| `JWT_EXPIRES_IN` | No | `15m` | Access token TTL |
| `JWT_REFRESH_SECRET` | Yes | — | Min 32 chars, different from JWT_SECRET |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token TTL |
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
| `CORS_ORIGINS` | No | `""` | Comma-separated allowed origins |

App will **refuse to start** if required variables are missing.

---

## API overview

Base path: `/api/v1`

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Create org + first admin |
| POST | `/auth/login` | Public | Login → access + refresh tokens |
| POST | `/auth/refresh` | Refresh token | Rotate refresh token |
| POST | `/auth/logout` | Bearer | Revoke refresh token |

### Organizations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/organizations/me` | Bearer | Current org info |

### Users

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/users` | admin | List org users |
| GET | `/users/:id` | admin | Get user |
| PATCH | `/users/:id` | admin | Update role / name |
| POST | `/users/:id/activate` | admin | Approve user |
| POST | `/users/:id/deactivate` | admin | Disable user |

### Products

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/products` | any | List with search + pagination |
| GET | `/products/:id` | any | Get product |
| POST | `/products` | admin | Create product |
| PATCH | `/products/:id` | admin | Update product |
| DELETE | `/products/:id` | admin | Delete product |

---

## Architecture

### Multi-tenancy
Every query is scoped by `organizationId` from the JWT claims.
`super_admin` role can bypass tenant isolation (not yet implemented — reserved for future support tooling).

### Auth flow
1. `POST /auth/login` → returns `{ accessToken, refreshToken }`
2. Include `Authorization: Bearer <accessToken>` on protected routes
3. When access token expires (15 min), call `POST /auth/refresh` with `Authorization: Bearer <refreshToken>`
4. Refresh tokens are stored hashed (SHA-256), rotated on each use, expire after 7 days

### Tenant isolation enforcement
- Services receive `orgId` from `@CurrentUser()` decorator (extracted from validated JWT)
- All Prisma queries include `organizationId: orgId` in `where`
- `findOne` always checks both `id` AND `organizationId` — wrong org returns 404, not a data leak

---

## Migration plan from Flask

### Phase 1 (current)
- Auth, Organizations, Users, Products
- NestJS API runs on port 3000; Flask app continues on port 5000

### Phase 2
- Invoices, Inventory (warehouses, movements, transfers)

### Phase 3
- Orders (with server-side pagination), Imports (CSV upload)

### Phase 4
- Reports (VAT, P&L, profitability, settlements, fees)
- Admin endpoints (audit logs, backups)

### Phase 5 (UI migration)
- After API is complete and tested, migrate the Jinja2 templates to a React/Next.js frontend consuming the NestJS API
- Flask app decommissioned after UI migration is verified

---

## Useful commands

```bash
npm run start:dev       # watch mode
npm run build           # compile TypeScript
npm run start           # run compiled dist/
npm run db:migrate      # run pending migrations
npm run db:generate     # regenerate Prisma client after schema changes
npm run db:push         # push schema without migration history (dev only)
npm run db:seed         # seed default admin + org
npm run db:studio       # open Prisma Studio at localhost:5555
npm run lint            # eslint
npm run test            # jest
```
