# WM CareerConnect frontend

The frontend uses React, Vite, React Router, Tailwind CSS, and JavaScript (JSX).

## Getting started

```bash
npm install
npm run dev
```

Set `VITE_API_URL` in a local `.env` file to the backend API base URL. The Vite
config also exposes the existing `NEXT_PUBLIC_` prefix so current local
environment files continue to work during migration.

## Available scripts

- `npm run dev` starts the Vite development server.
- `npm run build` creates a production build in `dist/`.
- `npm run preview` serves the production build locally.
- `npm run lint` checks the frontend source.

Application routes are declared in `src/app/routes.jsx`. Shared UI belongs in
`src/components`, route screens in `src/pages`, and backend calls in `src/services`.
The feature page files are starter screens to be connected to their backend workflows.
