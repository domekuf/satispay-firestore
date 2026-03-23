#!/usr/bin/env bash

set -euo pipefail

: "${PROJECT_ID:=satispay-gw}"
: "${REGION:=europe-west1}"
: "${ARTIFACT_REPOSITORY:=satispay-firestore}"
: "${GITHUB_REPO:=domekuf/satispay-firestore}"
: "${DEPLOYER_SA:=github-deployer}"
: "${RUNTIME_SA:=muvat-runtime}"
: "${WIF_POOL:=github}"
: "${WIF_PROVIDER:=github}"
: "${CLOUD_RUN_SERVICE:=muvat-api}"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
DEPLOYER_SA_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA_EMAIL="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
WIF_PROVIDER_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"

echo "==> Bootstrap GCP for ${PROJECT_ID}"
echo "    region: ${REGION}"
echo "    repo:   ${GITHUB_REPO}"
echo

echo "==> Enable required APIs"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  serviceusage.googleapis.com \
  sts.googleapis.com \
  --project "$PROJECT_ID"

echo "==> Create Artifact Registry repository if missing"
if ! gcloud artifacts repositories describe "$ARTIFACT_REPOSITORY" \
  --project "$PROJECT_ID" \
  --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$ARTIFACT_REPOSITORY" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --repository-format=docker
fi

echo "==> Create service accounts if missing"
if ! gcloud iam service-accounts describe "$DEPLOYER_SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$DEPLOYER_SA" \
    --project "$PROJECT_ID" \
    --display-name "GitHub Actions deployer"
fi

if ! gcloud iam service-accounts describe "$RUNTIME_SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_SA" \
    --project "$PROJECT_ID" \
    --display-name "Cloud Run runtime"
fi

echo "==> Grant deployer project roles"
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
    --role "$role" \
    --quiet >/dev/null
done

echo "==> Allow deployer to use runtime service account"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA_EMAIL" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${DEPLOYER_SA_EMAIL}" \
  --role "roles/iam.serviceAccountUser" \
  --quiet >/dev/null

echo "==> Grant runtime roles"
for role in \
  roles/datastore.user \
  roles/firebaseauth.admin
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${RUNTIME_SA_EMAIL}" \
    --role "$role" \
    --quiet >/dev/null
done

echo "==> Create Workload Identity Pool if missing"
if ! gcloud iam workload-identity-pools describe "$WIF_POOL" \
  --project "$PROJECT_ID" \
  --location global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$WIF_POOL" \
    --project "$PROJECT_ID" \
    --location global \
    --display-name "GitHub Actions"
fi

echo "==> Create Workload Identity Provider if missing"
if ! gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" \
  --project "$PROJECT_ID" \
  --location global \
  --workload-identity-pool "$WIF_POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --project "$PROJECT_ID" \
    --location global \
    --workload-identity-pool "$WIF_POOL" \
    --display-name "GitHub repo provider" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition "assertion.repository=='${GITHUB_REPO}'"
fi

echo "==> Allow GitHub repo to impersonate deployer"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA_EMAIL" \
  --project "$PROJECT_ID" \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}" \
  --role "roles/iam.workloadIdentityUser" \
  --quiet >/dev/null

cat <<EOF

Bootstrap completato.

GitHub repository variables da configurare:
  GCP_PROJECT_ID=${PROJECT_ID}
  GCP_REGION=${REGION}
  GCP_ARTIFACT_REGISTRY_REPOSITORY=${ARTIFACT_REPOSITORY}
  GCP_WORKLOAD_IDENTITY_PROVIDER=${WIF_PROVIDER_NAME}
  GCP_SERVICE_ACCOUNT_EMAIL=${DEPLOYER_SA_EMAIL}
  CLOUD_RUN_SERVICE=${CLOUD_RUN_SERVICE}
  CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT=${RUNTIME_SA_EMAIL}
  VITE_FIREBASE_PROJECT_ID=${PROJECT_ID}

GitHub repository secrets da configurare:
  ENCRYPTION_KEY
  ENCRYPTION_KEY_PREVIOUS
  M2M_JWT_SECRET
  M2M_CLIENTS
  SATISPAY_SECRET

Variabili opzionali:
  API_BASE_URL
  SATISPAY_ENV
  CLOUD_RUN_ALLOW_UNAUTHENTICATED=true
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
  VITE_FIREBASE_MEASUREMENT_ID

EOF
