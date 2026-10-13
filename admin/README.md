# WM CareerConnect Admin

Standalone administrative console (React + Vite + JavaScript). It talks to the
shared backend in `../backend` and is independent of `../frontend`.

## Run

```
npm install
npm run dev      # http://localhost:5180 (fails if the port is taken)
npm run build
npm run lint
```

`VITE_API_URL` sets the API base URL (default `http://localhost:5000/api/v1`).
See `.env.example`. Do not commit a real `.env`.

## Cross-origin requirements (backend side)

The refresh cookie is sent with `credentials: "include"`, so the backend must
allow this app's origin. In development the backend accepts any `localhost`
port. For production, this app's origin must be listed in the backend's
`WEB_ORIGIN`.

## Phase 1 scope

Login, in-memory session with cookie-based restore, single-flight token
refresh, logout, permission-aware navigation, and the dashboard
(`GET /dashboard/stats`, requires `reports.view`). Other modules appear in the
navigation as "Soon" and are not operational yet.
