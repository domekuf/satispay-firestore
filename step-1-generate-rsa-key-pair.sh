#!/bin/bash
# https://developers.satispay.com/reference/generate-rsa-keys

openssl genrsa -out private.pem 4096
openssl rsa -in private.pem -outform PEM -pubout -out public.pem