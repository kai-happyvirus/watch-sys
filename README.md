# Watch Sys

Simple, intuitive status dashboard that aggregates incident updates. The Node proxy polls Azure RSS feeds every five minutes and exposes a JSON API used by the React UI.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## What's included

- React + Vite frontend
- Node + Express RSS proxy
- Azure status feeds wired in
- Optional placeholders for AWS, GCP, and social sources

## Run locally

1. Install dependencies:
	- `npm install`
	- `npm --prefix server install`
2. Start UI + server together:
	- `npm run dev`

The UI runs on port 5173. The proxy server runs on port 5174.

## Build

- `npm run build`

## API

- `GET /api/incidents` returns cached incidents grouped by provider
- `GET /api/health` basic health check

## Deploy (easy & free)

Recommended: Render (free tier).

1. Push this repo to GitHub.
2. In Render, create a new Web Service from the repo.
3. Set build command:
	- `npm install && npm --prefix server install && npm run build`
4. Set start command:
	- `npm --prefix server run start`

Render will expose a single URL that serves both the API and the UI.
