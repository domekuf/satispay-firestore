Satispay firestore
==================

Deployment automatico con GitHub Actions: vedi [docs/deployment.md](docs/deployment.md).

API
---
```
POST /payment
{
  "orderId": "any-string",
  "phoneNumber": "+393214567890",
  "price": 500
}
Response
{
  "paymentId": "payment-id"
}

GET /paymentState/{paymentId}
{
  "status": "ACCEPTED",
  "orderId": "any-string",
  "updated": "Thu, 14 Mar 2024 00:57:56 GMT"
}

Websocket /payment/{paymentId} to receive updates
{
  "status": "ACCEPTED",
  "orderId": "any-string",
  "updated": "Thu, 14 Mar 2024 00:57:56 GMT"
}
```

Quickstart
----------

Create environment variables file
```
# env.sh
export SATISPAY_ACTIVATION_CODE={{SATISPAY_ACTIVATION_CODE}}

API_ENDPOINT=payment # API
HOST=0.0.0.0
PORT=3000 
PAYMENTS_COLLECTION=payments # Firebase collection name
SECRET=XYZ # used to construct Satispay's callback url
LOCATION=https://pay.ginepro.cc

FIREBASE_API_KEY={{FIREBASE_API_KEY}}
FIREBASE_AUTH_DOMAIN={{FIREBASE_AUTH_DOMAIN}}
FIREBASE_PROJECT_ID={{FIREBASE_PROJECT_ID}}
FIREBASE_STORAGE_BUCKET={{FIREBASE_STORAGE_BUCKET}}
FIREBASE_MESSAGING_SENDER_ID={{FIREBASE_MESSAGING_SENDER_ID}}
FIREBASE_APP_ID={{FIREBASE_APP_ID}}
FIREBASE_MEASUREMENT_ID={{FIREBASE_MEASUREMENT_ID}}

# Machine-to-machine auth
M2M_JWT_SECRET={{M2M_JWT_SECRET}}
M2M_CLIENTS='[{"clientId":"crecap","clientSecret":"{{CRECAP_M2M_CLIENT_SECRET}}","tenantId":"tenant-id","role":"admin"}]'
```
Generate KEY pairs
```
./step-1-generate-rsa-key-pair.sh
```
Obtain `key-id.json`
```
./step-2-obtain-key-id.sh
```
Install dependencies
```
npm install
```
Run service
```
node index.js
```

Machine-to-machine
------------------

Se configuri `M2M_JWT_SECRET` e `M2M_CLIENTS`, il backend espone `POST /auth/m2m/token` e accetta i bearer token M2M sulle stesse route protette gia usate con Firebase.

```bash
curl -X POST http://localhost:3000/auth/m2m/token \
  -H 'Content-Type: application/json' \
  -d '{
    "clientId": "crecap",
    "clientSecret": "'"$CRECAP_M2M_CLIENT_SECRET"'",
    "grantType": "client_credentials"
  }'
```

Response:

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer"
}
```

Puoi usare anche `Authorization: Basic base64(clientId:clientSecret)` al posto del body. Se non configuri `M2M_TOKEN_TTL_SECONDS`, i token emessi non scadono. Il token restituito va poi inviato come `Authorization: Bearer <access_token>` verso `/instances`, `/payment/:instanceId` e le altre route autenticate.
