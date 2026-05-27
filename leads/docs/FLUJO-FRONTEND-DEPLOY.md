# Flujo frontend → producción (repo standalone + monorepo)

## Repos

| Repo | Rol |
|------|-----|
| [SISTEMA_SEGUIMIENTO_LEADS](https://github.com/MiPrimerCasa/SISTEMA_SEGUIMIENTO_LEADS) | El frontend trabaja aquí (ramas + PR → `main`) |
| [encuesta-sorteo](https://github.com/MiPrimerCasa/encuesta-sorteo) | Monorepo; carpeta `leads/` es lo que corre en `/leads` |

## Flujo automático (recomendado)

1. Frontend: rama `feat/...` → PR → merge a **`main`** en **SISTEMA_SEGUIMIENTO_LEADS**.
2. GitHub Actions (**Sync monorepo y deploy producción**):
   - Copia el código a `encuesta-sorteo/leads/`
   - Commit + push a `main` del monorepo (si hay diff)
   - SSH al VPS y ejecuta `leads/deploy/deploy-vps-docker.sh`
3. Producción actualizada en `https://www.miprimercasafsa-sorteo.com/leads`

## Configuración única (admin del repo standalone)

En **SISTEMA_SEGUIMIENTO_LEADS** → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Descripción |
|--------|-------------|
| `MONOREPO_PUSH_TOKEN` | [PAT](https://github.com/settings/tokens) (classic o fine-grained) con **write** en `MiPrimerCasa/encuesta-sorteo` |
| `VPS_HOST` | `72.60.12.48` (o el host actual) |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Clave privada SSH del deploy (la misma que en encuesta-sorteo) |

### Instalar el workflow en el repo standalone

**Estado actual:** en `main` ya están instalados:

- `.github/workflows/sync-monorepo-and-deploy.yml`
- `scripts/sync-to-monorepo.sh`

Si en tu clone ya tenés esos archivos, **saltá este bloque** y andá a [Configurar secrets](#configurar-secrets-una-sola-vez).

Solo copiá si faltan (desde este repo o desde el monorepo en el VPS):

```powershell
cd C:\ruta\a\SISTEMA_SEGUIMIENTO_LEADS
New-Item -ItemType Directory -Force .github\workflows, scripts
Copy-Item deploy\github-workflow\sync-monorepo-and-deploy.yml .github\workflows\
Copy-Item scripts\sync-to-monorepo.sh scripts\   # si no existe
git add .github/workflows/sync-monorepo-and-deploy.yml scripts/sync-to-monorepo.sh
git commit -m "ci: sync automático al monorepo y deploy VPS"
git push origin main
```

> Plantilla: `deploy/github-workflow/sync-monorepo-and-deploy.yml`  
> Activo en GitHub: `.github/workflows/sync-monorepo-and-deploy.yml`

### Configurar secrets (una sola vez)

### Crear el PAT (`MONOREPO_PUSH_TOKEN`)

**Fine-grained (recomendado):**

- Repository access: solo `encuesta-sorteo`
- Permissions: **Contents** → Read and write

**Classic:**

- Scope: `repo` (o al menos acceso al repo de la org)

Guardar el token como secret `MONOREPO_PUSH_TOKEN` en **SISTEMA_SEGUIMIENTO_LEADS** (no en el monorepo).

### Error 128 en Actions (git)

Mirá **qué paso está en rojo** en el log:

| Paso rojo | Causa habitual | Qué hacer |
|-----------|----------------|-----------|
| **Commit y push en monorepo** | PAT sin write, rebase con cambios locales | Revisar `MONOREPO_PUSH_TOKEN`; el workflow hace `git reset --hard` + `rebase` + push con token explícito |
| **Subir leads al VPS** | `dial tcp … i/o timeout` (intermitente) | Reintentar el workflow; secrets `VPS_*` en **este** repo. Si falla SCP pero la encuesta despliega, comparar `VPS_HOST` con el de encuesta-sorteo |
| **Desplegar leads en VPS** | Docker / healthcheck | Ver log del paso SSH |

Deploy activo: sync monorepo + git pull en VPS via encuesta-sorteo. Ultimo deploy: 2026-05-27 07:44

Si sigue fallando, abrí el paso rojo y buscá `fatal:` o `error message:`.

### Probar el deploy (manual)

1. GitHub → **MiPrimerCasa/SISTEMA_SEGUIMIENTO_LEADS** → **Actions**
2. Workflow **「Sync monorepo y deploy producción」**
3. **Run workflow** → branch `main` → **Run workflow**

Debería: sync a `encuesta-sorteo/leads/` → push al monorepo (si hay diff) → SSH al VPS → `./leads/deploy/deploy-vps-docker.sh`

### Verificar producción

- https://www.miprimercasafsa-sorteo.com/leads
- Login del CRM y pantalla de leads

### Flujo normal (de ahora en más)

Rama → PR → merge a `main` en **SISTEMA_SEGUIMIENTO_LEADS** → Actions corre solo → producción actualizada.

## Flujo manual (respaldo)

```bash
# 1. Sync local
git clone https://github.com/MiPrimerCasa/SISTEMA_SEGUIMIENTO_LEADS.git
git clone https://github.com/MiPrimerCasa/encuesta-sorteo.git
cd SISTEMA_SEGUIMIENTO_LEADS && git checkout main && git pull
bash scripts/sync-to-monorepo.sh . ../encuesta-sorteo
cd ../encuesta-sorteo && git add leads && git commit -m "chore(leads): sync manual" && git push

# 2. Deploy
ssh root@VPS 'cd /opt/encuesta-landingqr && git pull && ./leads/deploy/deploy-vps-docker.sh'
```

## Qué no hace el sync

- No copia `.env` (cada entorno tiene el suyo).
- No copia `.github/` del standalone al monorepo (workflows distintos).
- No pisa `leads/deploy/github-workflow/` (plantillas solo del monorepo).

## Frontend: reglas

- Trabajar solo en **SISTEMA_SEGUIMIENTO_LEADS**.
- Usar ramas; integrar con PR a `main`.
- Avisar cuando `main` esté listo; el deploy corre solo al merge (si Actions está configurado).
