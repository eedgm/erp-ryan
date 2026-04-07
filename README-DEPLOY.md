# Guía de Despliegue en Railway

## Requisitos previos
- Cuenta en GitHub (gratis): https://github.com
- Cuenta en Railway (gratis): https://railway.app

---

## PASO 1 — Instalar Git en tu computadora

Si no lo tienes instalado:
- **Windows:** https://git-scm.com/download/win
- **Mac:** ya viene instalado, o instala con `xcode-select --install`

---

## PASO 2 — Subir el código a GitHub

Abre una terminal (CMD o PowerShell en Windows, Terminal en Mac):

```bash
# Ir a la carpeta del proyecto
cd ruta/donde/descomprimiste/erp-final

# Inicializar git
git init
git add .
git commit -m "Sistema ERP - versión inicial"

# Crear repositorio en GitHub:
# 1. Ve a https://github.com/new
# 2. Nómbralo: erp-sistema (privado)
# 3. NO inicialices con README
# 4. Copia la URL que te da GitHub (termina en .git)

# Conectar y subir
git remote add origin https://github.com/TU_USUARIO/erp-sistema.git
git branch -M main
git push -u origin main
```

---

## PASO 3 — Crear el proyecto en Railway

1. Entra a **https://railway.app** e inicia sesión con tu cuenta de GitHub
2. Haz clic en **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Elige el repositorio `erp-sistema` que acabas de crear
5. Railway detectará automáticamente que es Node.js

---

## PASO 4 — Agregar base de datos PostgreSQL

1. Dentro de tu proyecto en Railway, haz clic en **"+ New"**
2. Selecciona **"Database"** → **"PostgreSQL"**
3. Railway crea la base de datos y conecta todo automáticamente
4. Haz clic en la base de datos → pestaña **"Variables"**
5. Copia el valor de `DATABASE_URL` (lo necesitas en el siguiente paso)

---

## PASO 5 — Configurar las variables de entorno

1. Haz clic en tu servicio de backend en Railway
2. Ve a la pestaña **"Variables"**
3. Agrega estas variables una por una (botón "+ New Variable"):

```
DATABASE_URL        = (pega el valor copiado del paso 4)
JWT_SECRET          = (genera una aquí: https://generate-secret.vercel.app/64)
NODE_ENV            = production
PORT                = 3000
```

4. Haz clic en **"Deploy"** para que tome los cambios

---

## PASO 6 — Correr las migraciones (crear las tablas)

1. En Railway, haz clic en tu servicio de backend
2. Ve a la pestaña **"Settings"** → sección **"Deploy"**
3. En **"Start Command"** cambia temporalmente a:
   ```
   node src/config/migrate-all.js && node src/config/seed.js && node src/server.js
   ```
4. Haz clic en **"Deploy"**
5. Ve a la pestaña **"Logs"** y espera ver:
   ```
   ✓ Sprint 1 OK
   ✓ Sprint 2 OK
   ...
   Seed completado: usuarios creados
   ERP corriendo en puerto 3000
   ```
6. Regresa a **"Settings"** y vuelve el Start Command a simplemente:
   ```
   node src/server.js
   ```

---

## PASO 7 — Desplegar el frontend

El frontend se puede servir de dos formas. La más sencilla es usar **Vercel** (gratis):

1. Ve a **https://vercel.com** e inicia sesión con GitHub
2. Haz clic en **"New Project"** → importa `erp-sistema`
3. En **"Root Directory"** escribe: `frontend`
4. En **"Build Command"**: `npm run build`
5. En **"Output Directory"**: `dist`
6. En **"Environment Variables"** agrega:
   ```
   VITE_API_URL = https://TU-BACKEND.up.railway.app/api
   ```
   (La URL de Railway la encuentras en el servicio de backend → pestaña "Settings" → "Domains")
7. Haz clic en **"Deploy"**

---

## PASO 8 — Primer acceso

Después del despliegue, abre la URL de Vercel en tu navegador.

**Credenciales iniciales:**
```
Email:    ryan@tuempresa.com
Password: Cambiar123!
```

⚠️ **Importante:** Entra a Usuarios → cambia las contraseñas de inmediato.

---

## Estructura del repositorio que sube a GitHub

```
erp-sistema/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── config/       ← migraciones y seeds
│   │   ├── controllers/  ← lógica de negocio
│   │   ├── routes/       ← endpoints API
│   │   ├── middleware/    ← auth, validaciones
│   │   ├── utils/        ← logger
│   │   └── services/     ← email
│   ├── package.json
│   ├── railway.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── pages/
│   │   ├── components/
│   │   ├── contexts/
│   │   └── utils/
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
├── .gitignore
└── README-DEPLOY.md
```

---

## Costos estimados

| Servicio | Plan | Costo |
|----------|------|-------|
| Railway Backend + DB | Hobby | ~$5-15 USD/mes |
| Vercel Frontend | Free | $0 |
| Dominio (opcional) | Namecheap | ~$12 USD/año |
| **Total** | | **~$5-15 USD/mes** |

---

## Soporte

Si algo no funciona, los logs de Railway son tu mejor amigo:
- Backend: Railway → tu servicio → pestaña "Logs"
- Base de datos: Railway → PostgreSQL → pestaña "Data" para ver las tablas

Los errores más comunes:
- `Cannot find module` → falta algún archivo, revisa que todos los sprints estén en la carpeta
- `Connection refused` → la `DATABASE_URL` no está bien configurada
- `JWT_SECRET` no definido → falta la variable de entorno en Railway
