const crypto = require('crypto')
const axios = require('axios');
const fs = require('fs');

const satispayApi = '/g_business/v1'

const key = JSON.parse(fs.readFileSync('key-id.json', {encoding: 'utf-8'}));
const keyId = key.key_id;
const privateKey = fs.readFileSync('private.pem', {encoding: 'utf-8'});


const digestGet = `SHA-256=`.concat(crypto.createHash('sha256').update('').digest('base64'))

const stringGet = (phoneNumber, date) => `(request-target): get ${satispayApi}/consumers/${phoneNumber}
host: authservices.satispay.com
date: ${date}
digest: ${digestGet}`;

const optionsGet = (phoneNumber, date) => {
  const signature = crypto.createSign('RSA-SHA256').update(stringGet(phoneNumber, date)).sign(privateKey, 'base64')
  const authorizationHeader = `Signature keyId="${keyId}", algorithm="rsa-sha256", headers="(request-target) host date digest", signature="${signature}"`
  return {
    method: 'GET',
    url: `https://authservices.satispay.com${satispayApi}/consumers/${phoneNumber}`,
    headers: {
      accept: 'application/json',
      host: 'authservices.satispay.com',
      date,
      digest: digestGet,
      authorization: authorizationHeader
    }
  }
};

const stringGetPayments = (paymentId, date) => `(request-target): get ${satispayApi}/payments/${paymentId}
host: authservices.satispay.com
date: ${date}
digest: ${digestGet}`;

const optionsGetPayments = (paymentId, date) => {
  const signature = crypto.createSign('RSA-SHA256').update(stringGetPayments(paymentId, date)).sign(privateKey, 'base64')
  const authorizationHeader = `Signature keyId="${keyId}", algorithm="rsa-sha256", headers="(request-target) host date digest", signature="${signature}"`
  return {
    method: 'GET',
    url: `https://authservices.satispay.com${satispayApi}/payments/${paymentId}`,
    headers: {
      accept: 'application/json',
      host: 'authservices.satispay.com',
      date,
      digest: digestGet,
      authorization: authorizationHeader
    }
  }
};

const stringPost = (digest, date) => `(request-target): post ${satispayApi}/payments
host: authservices.satispay.com
date: ${date}
digest: ${digest}`;

const optionsPost = (body, date) => {
  const bodyStr = JSON.stringify(body);
  const digest = `SHA-256=`.concat(crypto.createHash('sha256').update(bodyStr).digest('base64'))
  const signature = crypto.createSign('RSA-SHA256').update(stringPost(digest, date)).sign(privateKey, 'base64')
  const authorizationHeader = `Signature keyId="${keyId}", algorithm="rsa-sha256", headers="(request-target) host date digest", signature="${signature}"`
  return {
    method: 'POST',
    headers: {
      accept: 'application/json',
      host: 'authservices.satispay.com',
      'Content-Type': 'application/json',
      'Date': date,
      'Digest': digest,
      authorization: authorizationHeader
    },
  };
}


async function createPayment(orderId, price, phoneNumber, callbackUrl) {

  return new Promise((resolve, reject) => {

    const date = new Date().toUTCString();

    axios
      .request(optionsGet(phoneNumber, date))
      .then((response) => {

        const body = {
          flow: 'MATCH_USER',
          amount_unit: price,
          currency: 'EUR',
          consumer_uid: response.data.id,
          external_code: orderId,
          metadata: {
            orderId
          },
          callback_url: callbackUrl,
        };

        const url = `https://authservices.satispay.com${satispayApi}/payments`;
        axios
          .post(url, body, optionsPost(body, date))
          .then((response) => {
            resolve({
              paymentId: response.data.id
            })
          })
          .catch((error) => {
            console.error(error.response.data);
            reject(error.response.data)
          });
    }).catch((error) => {
      reject(error)
    });
  });
}

async function getPayment(paymentId) {
  const date = new Date().toUTCString();
  return new Promise((resolve, reject) => {
    axios
      .request(optionsGetPayments(paymentId, date))
      .then((response) => {
        resolve(response.data);
      }).catch((error) => {
        reject(error);
      })
  });
}

module.exports = {createPayment, getPayment};