Satispay firestore
==================

API
---
```
POST /payment
{
  "orderId": "any-string",
  "phoneNumber": "+393214567890"
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
PRICE=500 # EUR cents
SECRET=XYZ # used to construct Satispay's callback url
LOCATION=https://pay.ginepro.cc

FIREBASE_API_KEY={{FIREBASE_API_KEY}}
FIREBASE_AUTH_DOMAIN={{FIREBASE_AUTH_DOMAIN}}
FIREBASE_PROJECT_ID={{FIREBASE_PROJECT_ID}}
FIREBASE_STORAGE_BUCKET={{FIREBASE_STORAGE_BUCKET}}
FIREBASE_MESSAGING_SENDER_ID={{FIREBASE_MESSAGING_SENDER_ID}}
FIREBASE_APP_ID={{FIREBASE_APP_ID}}
FIREBASE_MEASUREMENT_ID={{FIREBASE_MEASUREMENT_ID}}
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