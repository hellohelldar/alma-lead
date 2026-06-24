# Alma — Frontend

Lead-management frontend for an immigration law firm, built with Next.js (App
Router), TypeScript, and Tailwind CSS.

## Pages

- `/` — Public lead intake form (name, email, resume upload).
- `/login` — Attorney sign in.
- `/leads` — Protected internal console: filter, search, paginate, download
  resumes, and mark leads as reached out.

## Prerequisites

- Node 22+
- The backend API running (default `http://localhost:8000`).

## Configuration

The API base URL comes from `NEXT_PUBLIC_API_BASE_URL`.

```bash
cp .env.example .env.local
# edit .env.local if your backend is not on http://localhost:8000
```

## Install & run

```bash
npm install      # install dependencies
npm run dev      # start the dev server at http://localhost:3000
```

## Production build

```bash
npm run build    # production build (also type-checks)
npm run start    # serve the production build
```

## Type checking

```bash
npx tsc --noEmit
```

## Docker

```bash
docker build -t alma-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 alma-frontend
```

## Project structure

```
app/            App Router routes (/, /login, /leads) + root layout
components/      Reusable UI (Button, Input, Badge, Alert)
lib/            API client, auth/token helpers, types, utils
```
