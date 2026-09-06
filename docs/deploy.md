# Deploying AgentProof

Two supported shapes, both running the same code path as `npm start` on `http://127.0.0.1:4173`:

- **Single service (Render only).** One Node process serves `/api/*` and the built frontend from `public/`. Fewest moving parts, no CORS.
- **Split hosting.** Static frontend on Vercel, API on Render. Two env vars have to agree.

## 1. Render

1. Push this repo, then Render dashboard > **New > Blueprint** and select it. `render.yaml` defines one free Node web service.
2. Render prompts for the `sync: false` vars at blueprint creation. All are optional for the demo — leave them blank to run on the simulator, and set `ALLOWED_ORIGINS` later only if you add Vercel.
3. Build is `npm ci --include=dev && npm run build`. `--include=dev` is mandatory: `NODE_ENV=production` makes npm omit devDependencies, and Vite is a devDependency.
4. Start is `node server.mjs`. `HOST=0.0.0.0` binds every interface; Render injects `PORT` and the server already reads it.
5. `AGENTPROOF_DB_PATH=/tmp/agentproof.db` because a free instance has an ephemeral filesystem and `/tmp` is always writable. The store migrates, seeds the core cases, and runs the seeded evaluation on every boot, so a cold start still has full evidence. Audit history does not survive a restart — attach a disk (commented block in `render.yaml`) and point the path at `/var/data/agentproof.db` if you need persistence.
6. Health check is `GET /api/health-deep`. It answers 200 whenever the process is up and reports `{ ok, adapter, database, buildPresent }`. `buildPresent: true` means this instance can serve the UI as well as the API.

Set on Render: `HOST`, `NODE_ENV`, `PAYMENT_ADAPTER`, `AGENTPROOF_DB_PATH` (all pre-filled by the blueprint), plus `ALLOWED_ORIGINS` only for split hosting and `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `AGENTPROOF_LLM_*` only if you want those optional paths live.

## 2. Vercel (optional static frontend)

1. Import the repo. `vercel.json` sets `installCommand: npm ci --include=dev`, `buildCommand: npm run build`, `outputDirectory: public`, `framework: null`.
2. Add project env var `VITE_API_BASE_URL=https://<your-service>.onrender.com` for Production and Preview. It is read at build time and baked into the bundle, so changing it needs a redeploy. No trailing slash.
3. Back on Render, set `ALLOWED_ORIGINS=https://<your-project>.vercel.app` and redeploy. The API echoes `Access-Control-Allow-Origin` only for an exact match in that list; it never sends `*` and never reflects an unlisted origin, so leaving it unset fails closed.
4. Preview deployments get their own origins. Add each one to `ALLOWED_ORIGINS` (comma-separated) or demo from Production only.

Set on Vercel: `VITE_API_BASE_URL`. That is the only one.

## 3. Which shape to pick

Prefer Render-only for a judged demo: one URL, one log stream, no CORS or preview-origin drift, and the API and UI cannot version-skew. Add Vercel when you want CDN-served assets, instant preview URLs per branch, or the frontend to stay up while the API restarts.

## 4. Docker or any other host

```bash
docker build -t agentproof .
docker run --rm -p 4173:4173 agentproof
```

The image builds the frontend in a first stage and runs `node server.mjs` with `HOST=0.0.0.0`. Mount a volume at `/app/data` and set `AGENTPROOF_DB_PATH=/app/data/agentproof.db` for a durable audit chain. `.dockerignore` keeps local SQLite files, `.env`, and the host's `public/` out of the build context.

## 5. Verification

Replace `API` and `WEB` with your origins.

```bash
API=https://agentproof.onrender.com
WEB=https://agentproof.vercel.app

# 1. Process, adapter, database, and whether this instance also serves the UI.
curl -s "$API/api/health-deep"
# {"ok":true,"adapter":"simulator","database":"connected","buildPresent":true}

# 2. Original health route, unchanged.
curl -s "$API/api/health"

# 3. Evidence is seeded, not empty.
curl -s "$API/api/dashboard" | head -c 400

# 4. Guided proof runs end to end (five scenarios, one write path).
curl -s -X POST "$API/api/demo/run" -H 'content-type: application/json' -d '{}' | head -c 400

# 5. CORS allows the listed origin and only that origin.
curl -si -X OPTIONS "$API/api/dashboard" -H "Origin: $WEB" -H 'Access-Control-Request-Method: POST' | grep -i 'HTTP/\|access-control-allow-origin'
curl -si "$API/api/health" -H 'Origin: https://not-allowed.example' | grep -ic 'access-control-allow-origin'   # expect 0

# 6. SPA fallback serves the shell, missing assets still 404.
curl -s -o /dev/null -w '%{http_code}\n' "$API/policies"          # 200
curl -s -o /dev/null -w '%{http_code}\n' "$API/nope.js"           # 404

# 7. Frontend is talking to the API, not to itself.
curl -s "$WEB/" -o /dev/null -w '%{http_code}\n'                  # 200
```

In the browser, open the deployed UI, run the guided proof, and confirm a trace opens with a matched rule and hash chain. If requests fail with a CORS error, `ALLOWED_ORIGINS` on Render does not exactly match the browser's origin. If they hit the wrong host, `VITE_API_BASE_URL` was missing at Vercel build time.
