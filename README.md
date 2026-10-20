# FreshCut — rural meat delivery

Monorepo for the FreshCut meat delivery platform (working name).

## Apps

| Path | What | Stack |
|---|---|---|
| `apps/customer` | Customer app (Android first) | Expo / React Native |
| `apps/partner` | Dealer + delivery partner app | Expo / React Native |
| `apps/admin` | Admin panel | React + Vite + Refine |
| `apps/api` | Business-logic API (order state transitions, payments, settlements) | NestJS |
| `packages/shared` | Zod schemas, order state machine, shared types | TypeScript |
| `supabase/` | Database migrations, RLS policies, seed | SQL |

## Prerequisites

- Node 24 (`nvm use` reads .nvmrc), pnpm 9 (`corepack enable`)
- Supabase CLI (`brew install supabase/tap/supabase`)
- A Supabase project (region `ap-south-1`), Firebase project (FCM), Expo account

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # fill Supabase keys
cp apps/customer/.env.example apps/customer/.env
cp apps/partner/.env.example apps/partner/.env
cp apps/admin/.env.example apps/admin/.env
```

Apply the database schema to your Supabase project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Run

```bash
pnpm --filter api dev        # NestJS on :3001
pnpm --filter admin dev      # admin on :5173
pnpm --filter customer start # Expo dev server
pnpm --filter partner start  # Expo dev server
```

## Rules of the road

- Clients **read** from Supabase directly (RLS enforced). All **order state transitions go through the API** — never update `orders.status` from an app.
- Every state change writes to `order_status_history`.
- `.env` files are never committed; `service_role` key lives only in `apps/api`.
