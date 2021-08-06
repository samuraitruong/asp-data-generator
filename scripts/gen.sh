#!/bin/sh
CERT_PATH=../certs

mkdir $CERT_PATH || true
rm -rf $CERT_PATH/*.* || true

openssl genrsa -des3 -out $CERT_PATH/rootCA.key 2048
openssl req -x509 -new -nodes -key $CERT_PATH/rootCA.key -sha256 -days 1024  -out $CERT_PATH/rootCA.pem -config ./req.conf
#-subj "/C=AU/ST=VIC/L=Melbourne/O=CFOLA/OU=IT Department/CN=lh.cfola.demystdata.com"

openssl req -new -nodes -out $CERT_PATH/server.csr -newkey rsa:2048 -keyout $CERT_PATH/server.key -config ./req.conf
# -subj "/C=AU/ST=VIC/L=Melbourne/O=CFOLA/OU=IT Department/CN=lh.cfola.demystdata.com"
openssl x509 -req -in $CERT_PATH/server.csr -CA $CERT_PATH/rootCA.pem -CAkey $CERT_PATH/rootCA.key -CAcreateserial -out $CERT_PATH/server.crt -days 1000 -sha256 -extfile ./v3.ext

echo 'Enter your root password'
sudo security -v add-trusted-cert -r trustAsRoot -e hostnameMismatch -d -k /Library/Keychains/System.keychain $CERT_PATH/server.crt
