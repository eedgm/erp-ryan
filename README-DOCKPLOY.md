# Guia de despliegue en Dockploy

## Topologia recomendada

- `frontend` como aplicacion publica en `erp.tudominio.com`
- `backend` como aplicacion publica en `api-erp.tudominio.com`
- `postgres` como servicio interno con volumen persistente

## Archivos agregados

- `backend/Dockerfile`
- `backend/.dockerignore`
- `frontend/Dockerfile`
- `frontend/.dockerignore`
- `frontend/nginx.conf`
- `docker-compose.yml`

## Requisitos

- Repositorio subido a GitHub o Git privado accesible por Dockploy
- Un proyecto creado en Dockploy
- DNS o subdominios configurados para frontend y backend

## Servicio 1: PostgreSQL

Crear un servicio con imagen `postgres:16-alpine`.

Variables:

```env
POSTGRES_DB=erp
POSTGRES_USER=erp_user
POSTGRES_PASSWORD=super_secret_password
```

Montar un volumen persistente en:

```text
/var/lib/postgresql/data
```

No exponer PostgreSQL a Internet salvo que realmente lo necesites.

## Servicio 2: Backend

Crear una aplicacion desde este repositorio usando como directorio raiz `backend`.

- Dockerfile: `backend/Dockerfile`
- Puerto interno: `3000`
- Dominio sugerido: `api-erp.tudominio.com`

Variables minimas:

```env
DATABASE_URL=postgresql://erp_user:super_secret_password@postgres:5432/erp
NODE_ENV=production
PORT=3000
JWT_SECRET=pon_un_secreto_largo_y_unico
FRONTEND_URL=https://erp.tudominio.com
```

Variables opcionales si usas correo:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_FROM_NAME=Sistema ERP
BCRYPT_ROUNDS=12
```

## Servicio 3: Frontend

Crear otra aplicacion desde el mismo repositorio usando como directorio raiz `frontend`.

- Dockerfile: `frontend/Dockerfile`
- Puerto interno: `80`
- Dominio sugerido: `erp.tudominio.com`

Este frontend usa Vite, asi que `VITE_API_URL` se inyecta en build, no en runtime.

En Dockploy debes definir este build arg:

```env
VITE_API_URL=https://api-erp.tudominio.com/api
```

Si Dockploy te muestra una seccion separada para build arguments, cargalo ahi. Si solo permite variables de build en la configuracion del Dockerfile, usa ese mismo valor como build arg.

## Orden de despliegue

1. Crear y levantar `postgres`
2. Crear y desplegar `backend`
3. Ejecutar migraciones una vez en el backend:

```bash
node src/config/migrate-all.js
```

4. Ejecutar seed una vez en el backend:

```bash
node src/config/seed-all.js
```

5. Crear y desplegar `frontend`
6. Probar salud del API:

```text
https://api-erp.tudominio.com/health
```

## Prueba local con Docker Compose

Puedes probar primero de forma local:

```bash
docker compose up --build
```

Urls locales:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3000`
- PostgreSQL: `localhost:5432`

## Notas importantes

- El frontend usa `BrowserRouter`, por eso `frontend/nginx.conf` incluye fallback a `index.html`.
- `FRONTEND_URL` debe coincidir exactamente con el dominio real del frontend para que CORS funcione.
- No metas migraciones y seed en el comando normal de arranque del backend.
- El logger del backend escribe a `logs/`; en contenedores sirve para pruebas, pero a futuro conviene moverlo a stdout.
- Los `package-lock.json` no estan versionados en este repo. Por eso los Dockerfiles usan `npm install` en vez de `npm ci`. Si luego versionas los lockfiles, conviene volver a `npm ci` para builds reproducibles.
