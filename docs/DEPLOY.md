# Deploy del frontend (SPA)

Cada App Service hospeda **backend + frontend juntos**: el backend es la imagen de
contenedor; el frontend son archivos estáticos servidos desde `SPA_DIR=/home/site/spa`
(same-origin, así que el SPA llama a `/api/v1` en su propio host). Actualizar el frontend
= subir un nuevo build a ese mount por **Kudu zip-deploy**. El contenedor del backend no se
toca.

## TL;DR

```bash
# dev (API real, app-cl-prd-nmr-wp-msproc-dev)
scripts/deploy-spa.sh dev

# prd / demo mock (app-cl-prd-nmr-wp-msproc-01) — requiere confirmación
scripts/deploy-spa.sh prd --yes

# previsualizar sin subir (build + zip, sin PUT)
scripts/deploy-spa.sh dev --dry-run
```

Requisitos: `node`/`npm`, `az login` con permisos sobre el App Service (Contributor),
`zip`, `curl`. Para dev hay que estar en una red allow-listed (IP-locked) para que la
verificación final responda 200.

## Qué hace el script

1. **Build same-origin** (`VITE_BRIDGE_API_URL=/api/v1`), con auth distinto por ambiente:
   - **dev** → `VITE_AUTH_BYPASS=true` (DevAuthProvider): el dev IP-locked abre sin pantalla de login.
   - **prd** → `VITE_AUTH_BYPASS=false VITE_AUTH_PROVIDER=azure-ad` (MSAL, app registration
     `ms-process-app-prd`): -01 no tiene Easy Auth habilitado, así que `azure-builtin` deja el
     login en loop (`/.auth/login/aad` nunca resuelve).
   El auth por ambiente vive en el bloque `resolve_env` del script.
2. **Inyecta `config.js`**: `vite build` copia `public/config.js` (config localhost) dentro de
   `dist/`. El script lo reemplaza por el runtime config del ambiente:
   - dev → `deploy/config.dev.js`
   - prd → `deploy/config.prod.js`
   `config.js` se lee en runtime y se puede editar sin rebuild (toggles de módulos, authProvider).
3. **Zip + Kudu**: empaqueta `dist/` y hace `PUT https://<app>.scm.azurewebsites.net/api/zip/site/spa/`
   con un token AAD (`az account get-access-token --resource https://management.core.windows.net/`).
4. **prd está guardado**: sin `--yes` el script rehúsa subir a prd. `--dry-run` corta antes del PUT.
5. **Verifica** el deploy en vivo (index + `config.js` → 200).

## Superficies

| Env | App Service | Backend | Deploy |
|-----|-------------|---------|--------|
| `dev` | `app-cl-prd-nmr-wp-msproc-dev` | mock `ms-process-mock:demo` (IP-locked) | `scripts/deploy-spa.sh dev` |
| `prd` | `app-cl-prd-nmr-wp-msproc-01` | real `ms-process-api` (IP-locked + Entra login) | `scripts/deploy-spa.sh prd --yes` |

## Fuera del alcance de este script: la "prod real" en Storage `$web`

Existe además un pipeline ADO **`ms-process-app-deploy`** (`azure-pipelines-deploy.yml`) que se
dispara en **push a `main`**, buildea con **auth Entra real** (`VITE_AUTH_PROVIDER=azure-builtin`,
`VITE_AUTH_BYPASS=false`) y sube el SPA a un **Storage static website `$web`** (cuenta
`nmrwpmsprocspaprd`) vía `az storage blob upload-batch`. Ese es un mecanismo distinto (storage, no
Kudu) y ya está automatizado por CI; este script **no** lo reemplaza. Para esa superficie: merge a
`main` (o `az pipelines run --name ms-process-app-deploy`).

## Gotchas

- `vite build` siempre sobreescribe `dist/config.js` con el de `public/` (localhost). Por eso el
  paso 2 re-inyecta el config del ambiente — no editar `dist/config.js` a mano.
- El `PUT` de Kudu a `/api/zip/site/spa/` **extrae** el zip dentro de la carpeta (sobrescribe los
  archivos que coinciden) — no es un sync, no borra archivos viejos. Por eso siempre incluimos el
  `config.js` correcto en el zip.
- El módulo **Parámetros** aparece por default (`useModuleConfig` lo deja en `true`) y está gateado
  por rol `admin`; en los builds con auth-bypass el `DevAuthProvider` otorga `admin`. Para ocultarlo
  en algún ambiente, poner `parametros: false` en el `config.<env>.js` correspondiente.
