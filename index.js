const fastify = require('fastify')({logger: true})
fastify.register(require('@fastify/websocket'))
const fb = require('firebase/app');
const fs = require('firebase/firestore');
const { createPayment, getPayment} = require('./satispay');

const apiEndpoint = process.env.API_ENDPOINT || 'payment';
const host = process.env.HOST || '0.0.0.0';
const port = process.env.PORT || '3000';
const paymentsCollection = process.env.PAYMENTS_COLLECTION || 'payments';
const price = parseInt(process.env.PRICE) || 500;
const secret = process.env.SECRET || 'XYZ';
const location = process.env.LOCATION;

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

const app = fb.initializeApp(firebaseConfig);

const db = fs.getFirestore(app);

fastify.register(async (fastify) => {
  fastify.get(`/${apiEndpoint}/:paymentId`, { websocket: true }, (connection, request) => {
    const paymentId = request.params.paymentId;
    const unsub = fs.onSnapshot(fs.doc(db, paymentsCollection, paymentId), (doc) => {
      connection.socket.send(JSON.stringify(doc.data()));
      if (doc.data()['status'] === 'accepted') {
        connection.socket.close();
      }
    });
    connection.socket.on('close', () => {
      unsub();
    });
  });
})


// Declare a route
fastify.post(`/${apiEndpoint}`, async (request, reply) => {
  if (!request.body) {
    reply.status(400).send('body');
  }
  const orderId = request.body.orderId;
  const phoneNumber = request.body.phoneNumber;
  return createPayment(orderId, price, phoneNumber, `${location}/${secret}/{uuid}`)
    .then(async (payment) => {
      const paymentId = payment.paymentId;
      return fs.setDoc(fs.doc(db, paymentsCollection, paymentId), {orderId})
        .then(() => {
          reply.send(payment);
        });
    });
});

fastify.get(`/${apiEndpoint}State/:paymentId`, async (request, reply) => {
  const paymentId = request.params.paymentId;
  return fs.getDoc(fs.doc(db, paymentsCollection, paymentId))
    .then((doc) => {
      const data = doc.data();
      if (!data) {
        reply.status(404);
      }
      reply.send(data);
    });
});

fastify.get(`/${secret}/:paymentId`, async (request, reply) => {
  const paymentId = request.params.paymentId;
  return getPayment(paymentId)
    .then(async (r) => {
      return fs.updateDoc(fs.doc(db, paymentsCollection, paymentId), { updated: new Date().toUTCString(), status: r.status })
        .then(() => {
          reply.send();
        })
        .catch((error) => {
          reply.status(404).send(error);
        });
    });
});

fastify.listen({ host, port }, (err, _) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
});