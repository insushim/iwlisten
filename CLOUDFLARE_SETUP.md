# Cloudflare Pages + D1 Setup

## 1. Create D1 Database
wrangler d1 create iwlisten-db

Copy the database_id and update wrangler.toml

## 2. Apply Schema
wrangler d1 execute iwlisten-db --file=d1/schema.sql

## 3. GitHub Secrets Required
- CLOUDFLARE_API_TOKEN: API token from Cloudflare dashboard
- CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID

## 4. Cloudflare Pages Variables Required
- JWT_SECRET: long random secret used for self-auth JWT signing

## 5. Create Pages Project
wrangler pages project create iwlisten

## 6. Bind D1 to Pages Project
In Cloudflare Dashboard > Pages > iwlisten > Settings > Functions > D1 Database Bindings
Add: Variable name: DB, D1 database: iwlisten-db

## 7. Set JWT Secret
In Cloudflare Dashboard > Pages > iwlisten > Settings > Variables and Secrets
Add production and preview secret:
- JWT_SECRET
