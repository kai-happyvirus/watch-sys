# Watch Sys

Simple, intuitive status dashboard that aggregates incident updates from Azure, AWS, and GCP. The Node proxy polls RSS feeds every five minutes and exposes a JSON API used by the React UI.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## What's included

- React + Vite frontend
- Node + Express RSS proxy
- Azure, AWS, and GCP status feeds
- Optional social sources (X, Reddit) require API keys

## Run locally

1. Install dependencies:
	- `npm install`
	- `npm --prefix server install`
2. Set up database (optional, for persistent storage):
	- Set `DATABASE_URL` environment variable
	- Run migrations: `npm --prefix server run migrate up`
3. Start UI + server together:
	- `npm run dev`

The UI runs on port 5173. The proxy server runs on port 5174.

## Build

- `npm run build`

## API

- `GET /api/incidents` returns cached incidents grouped by provider
- `GET /api/incidents/history?days=7&provider=Azure&status=resolved&severity=critical&limit=100` returns historical incidents from database
  - Query params: `days` (1-90), `provider`, `status`, `severity`, `limit` (max 500)
- `GET /api/health` basic health check

## Notifications (Discord / Teams)

Set environment variables on your host:

- `ENABLE_NOTIFICATIONS=true`
- `DISCORD_WEBHOOK_URL=...` (optional)
- `TEAMS_WEBHOOK_URL=...` (optional)

When new incidents appear in the feeds, the server sends a short summary to the configured webhooks.

## Email subscriptions (Gmail SMTP)

Set environment variables on your host:

- `ENABLE_EMAIL_NOTIFICATIONS=true`
- `EMAIL_SMTP_USER=your_gmail@gmail.com`
- `EMAIL_SMTP_PASS=app_password`
- `EMAIL_FROM=your_gmail@gmail.com` (optional)
- `DATABASE_URL=postgresql://...` (required for persistent subscribers)

Endpoints:

- `POST /api/subscriptions/email` with JSON `{ "email": "user@example.com" }`
- `DELETE /api/subscriptions/email` with JSON `{ "email": "user@example.com" }`
- `GET /api/subscriptions/email` returns `{ "count": number }`

**PostgreSQL setup on Render:**
1. Create a PostgreSQL database (free tier)
2. Copy the Internal Database URL
3. Add as `DATABASE_URL` environment variable to your web service

## Deploy (easy & free)

Recommended: Render (free tier).

1. Push this repo to GitHub.
2. In Render, create a new Web Service from the repo.
3. Set build command:
	- `npm install && npm --prefix server install && npm run build`
4. Set start command:
	- `npm --prefix server run start`

Render will expose a single URL that serves both the API and the UI.
