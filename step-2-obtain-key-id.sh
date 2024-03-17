#!/bin/bash
# https://developers.satispay.com/reference/keyid

source env.sh
if [ -z "$SATISPAY_ACTIVATION_CODE" ]; then
    echo "Satispay activation code is not set."
    read -p "Please enter Satispay activation code, you can retrieve it from Satispay business dashboard: " SATISPAY_ACTIVATION_CODE
fi

# Replace newline with '\n' control character as stated in documentation
PUBKEY=$(sed ':a;N;$!ba;s/\n/\\n/g' public.pem)
echo -n $PUBKEY > public.txt

curl --request POST \
  --url https://authservices.satispay.com/g_business/v1/authentication_keys \
  --header 'content-type: application/json' \
  --data "{\"public_key\": \"$PUBKEY\",\"token\": \"$SATISPAY_ACTIVATION_CODE\"}" -o key-id.json