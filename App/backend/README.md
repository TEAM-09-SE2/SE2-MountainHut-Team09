# Backend quick start (auth + DB)

## 1) Start PostgreSQL (Docker)

From [App/docker/](</C:/Users/rokir/Desktop/SCUOLA CODE/SE2-MountainHut-Team09/App/docker>):

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
```

Default development config is in [App/docker/.env.example](</C:/Users/rokir/Desktop/SCUOLA CODE/SE2-MountainHut-Team09/App/docker/.env.example>).
In this project, local dev uses host port `55432` to avoid conflicts with local PostgreSQL services already bound to `5432`.

## 2) Start backend API

From [App/backend/](</C:/Users/rokir/Desktop/SCUOLA CODE/SE2-MountainHut-Team09/App/backend>):

```powershell
npm install
npm run dev
```

The backend reads DB/JWT/CORS settings from [App/docker/.env](</C:/Users/rokir/Desktop/SCUOLA CODE/SE2-MountainHut-Team09/App/docker/.env>) through `dotenv`.

## 3) Auth API smoke check

- `POST /api/v1/auth/register` → `201`
- `POST /api/v1/auth/login` → `200` + auth cookie
- `GET /api/v1/auth/me` (with cookie) → `200`
- `POST /api/v1/auth/logout` → `204`
- `GET /api/v1/auth/me` (after logout) → `401`