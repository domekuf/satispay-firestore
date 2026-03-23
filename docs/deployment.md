# Deployment

Questa repo e pensata per un deploy automatico su:

- Cloud Run per il backend Fastify
- Firebase Hosting per la UI React/Vite
- GitHub Actions per build e deploy

## Workflow disponibili

- `.github/workflows/ci.yml`
  Esegue `pnpm build` su pull request e push su `main`.
- `.github/workflows/deploy.yml`
  Fa deploy in produzione su push su `main` o tramite `workflow_dispatch`.

La pipeline di deploy esegue, in ordine:

1. autenticazione a Google Cloud via Workload Identity Federation
2. sync delle secret runtime in Secret Manager
3. build e push dell'immagine Docker del backend
4. deploy del backend su Cloud Run
5. aggiornamento di `LOCATION` con la base URL pubblica del backend
6. build del frontend con `VITE_API_BASE` puntato al backend di produzione
7. deploy del frontend su Firebase Hosting

Domini consigliati:

- UI: `https://satispay-admin.muvat.cloud`
- API e callback Satispay: `https://satispay.muvat.cloud`

## GitHub repository variables

Configura queste variabili in GitHub Actions:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_ARTIFACT_REGISTRY_REPOSITORY`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
  Formato: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`
  Service account usato da GitHub Actions per deployare.
- `CLOUD_RUN_SERVICE`
- `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`
  Consigliato: service account dedicato al runtime del backend.
- `CLOUD_RUN_ALLOW_UNAUTHENTICATED`
  Opzionale. Imposta `true` se vuoi che il workflow renda pubblico il servizio Cloud Run.
- `API_BASE_URL`
  Opzionale. Se impostata, il workflow usera questa URL per `LOCATION` e `VITE_API_BASE` al posto della `run.app`.
  Per questo setup: `https://muvat-api-304633219729.europe-west1.run.app`
- `SATISPAY_ENV`
  Opzionale. Lascia vuota o ometti per production, usa `sandbox` per test.
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
  Opzionale.

Per il nuovo progetto Firebase `satispay-gw`:

- `VITE_FIREBASE_API_KEY=<rigenera-questa-chiave>`
- `VITE_FIREBASE_AUTH_DOMAIN=satispay-gw.firebaseapp.com`
- `VITE_FIREBASE_PROJECT_ID=satispay-gw`
- `VITE_FIREBASE_STORAGE_BUCKET=satispay-gw.firebasestorage.app`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=304633219729`
- `VITE_FIREBASE_APP_ID=1:304633219729:web:aa1661ea9f8cd6d61f0d30`
- `VITE_FIREBASE_MEASUREMENT_ID=G-2JR8QL3KWX`

## GitHub repository secrets

- `ENCRYPTION_KEY`
- `ENCRYPTION_KEY_PREVIOUS`
  Opzionale ma consigliata durante la rotazione.
- `SATISPAY_SECRET`
- `M2M_JWT_SECRET`
- `M2M_CLIENTS`
  JSON array dei client autorizzati, ad esempio `[{"clientId":"erp-sync","clientSecret":"...","tenantId":"tenant-id","role":"admin"}]`.

## Bootstrap GCP una tantum

Questi passaggi si fanno una sola volta.

### 1. Variabili shell

```bash
export PROJECT_ID="satispay-gw"
export REGION="europe-west1"
export ARTIFACT_REPOSITORY="satispay-firestore"
export GITHUB_REPO="domekuf/satispay-firestore"
export DEPLOYER_SA="github-deployer"
export RUNTIME_SA="muvat-runtime"
export WIF_POOL="github"
export WIF_PROVIDER="github"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
```

### 2. Abilita le API necessarie

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  sts.googleapis.com \
  --project "$PROJECT_ID"
```

### 3. Crea Artifact Registry

```bash
gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
  --project "$PROJECT_ID" \
  --location "$REGION" \
  --repository-format docker
```

Nota sulla region:

- usa `europe-west1`, non `europe-west-1`
- va usata per Cloud Run, Artifact Registry e per il registry hostname `${REGION}-docker.pkg.dev`

### 4. Crea i service account

```bash
gcloud iam service-accounts create "$DEPLOYER_SA" \
  --project "$PROJECT_ID" \
  --display-name "GitHub Actions deployer"

gcloud iam service-accounts create "$RUNTIME_SA" \
  --project "$PROJECT_ID" \
  --display-name "Cloud Run runtime"
```

Salva gli indirizzi email:

```bash
export DEPLOYER_SA_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
export RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
```

### 5. Assegna i ruoli IAM

Ruoli al deployer:

```bash
for role in \
  roles/artifactregistry.writer \
  roles/cloudbuild.builds.editor \
  roles/firebasehosting.admin \
  roles/run.admin \
  roles/secretmanager.admin \
  roles/serviceusage.apiKeysViewer
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${DEPLOYER_SA_EMAIL}" \
    --role "$role"
done
```

Permesso di impersonare il runtime service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${DEPLOYER_SA_EMAIL}" \
  --role "roles/iam.serviceAccountUser"
```

Ruoli al runtime:

```bash
for role in \
  roles/datastore.user \
  roles/firebaseauth.admin
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role "$role"
done
```

### 6. Configura Workload Identity Federation

```bash
gcloud iam workload-identity-pools create "$WIF_POOL" \
  --project "$PROJECT_ID" \
  --location global \
  --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
  --project "$PROJECT_ID" \
  --location global \
  --workload-identity-pool "$WIF_POOL" \
  --display-name "GitHub repo provider" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition "assertion.repository=='${GITHUB_REPO}'"
```

Permetti al repo GitHub di impersonare il deployer:

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA_EMAIL" \
  --project "$PROJECT_ID" \
  --role "roles/iam.workloadIdentityUser" \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}"
```

### 7. Popola le GitHub variables

Imposta:

- `GCP_PROJECT_ID=$PROJECT_ID`
- `GCP_REGION=$REGION`
- `GCP_ARTIFACT_REGISTRY_REPOSITORY=$ARTIFACT_REPOSITORY`
- `GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/providers/$WIF_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL=$DEPLOYER_SA_EMAIL`
- `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT=$RUNTIME_SA_EMAIL`
- `SATISPAY_ENV=production`
- `VITE_FIREBASE_API_KEY=<rigenera-questa-chiave>`
- `VITE_FIREBASE_AUTH_DOMAIN=satispay-gw.firebaseapp.com`
- `VITE_FIREBASE_PROJECT_ID=satispay-gw`
- `VITE_FIREBASE_STORAGE_BUCKET=satispay-gw.firebasestorage.app`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=304633219729`
- `VITE_FIREBASE_APP_ID=1:304633219729:web:aa1661ea9f8cd6d61f0d30`
- `VITE_FIREBASE_MEASUREMENT_ID=G-2JR8QL3KWX`

### 8. Popola le GitHub secrets

Imposta:

- `ENCRYPTION_KEY`
- `SATISPAY_SECRET`
- `M2M_JWT_SECRET`
- `M2M_CLIENTS`
- `ENCRYPTION_KEY_PREVIOUS` se stai ruotando la chiave

## Note operative

- Il workflow usa la URL di Cloud Run come base API di default. Se monti un custom domain, imposta `API_BASE_URL`.
- `LOCATION` viene aggiornata dal workflow dopo ogni deploy, cosi il callback Satispay resta allineato.
- Se abiliti `CLOUD_RUN_ALLOW_UNAUTHENTICATED=true`, il workflow aggiunge `roles/run.invoker` a `allUsers` sul servizio.
- Le secret runtime vivono in Secret Manager e vengono aggiornate dal workflow a ogni deploy.
- Per abilitare il flusso machine-to-machine, configura `M2M_JWT_SECRET` e `M2M_CLIENTS`; il backend esporra `POST /auth/m2m/token` con grant `client_credentials`.
- Se non imposti `M2M_TOKEN_TTL_SECONDS`, i token M2M emessi non scadono. `M2M_JWT_ISSUER`, `M2M_JWT_AUDIENCE` e `M2M_TOKEN_TTL_SECONDS` restano supportate ma non sono necessarie per il deploy base.
- Per bootstrap veloce puoi usare anche [scripts/bootstrap-gcp.sh](../scripts/bootstrap-gcp.sh) con `PROJECT_ID`, `REGION` e gli altri env var sovrascrivibili.
- Per i nuovi progetti Firebase, il bucket di default Cloud Storage usa il formato `PROJECT_ID.firebasestorage.app`.
- Per sviluppo locale, il backend ha ancora bisogno di una chiave Admin SDK del progetto `satispay-gw` in `packages/server/firebase-credentials.json`.
- Il dominio UI puo essere `satispay-admin.muvat.cloud` su Firebase Hosting.
- L'API pubblica corrente e `https://muvat-api-304633219729.europe-west1.run.app`; usa questo valore anche per `API_BASE_URL` finche non configuri un custom domain valido.

## Riferimenti ufficiali

- [Cloud Run deployment docs](https://cloud.google.com/run/docs/deploying)
- [Cloud Run public access docs](https://cloud.google.com/run/docs/authenticating/public)
- [Firebase CLI in CI with Application Default Credentials](https://firebase.google.com/docs/cli#use_the_cli_with_ci_systems)
- [Firebase Hosting docs](https://firebase.google.com/docs/hosting)
