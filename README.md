# asp-data-generator

The simple script to generate asp data for testing purpose

## .env

INTUIT_CLIENT_ID=Your QBO App ID
INTUIT_CLIENT_SECRET=Your QBO App Secret
REDIRECT_URL=https://local.aspgenerator.com:3443/oauth

### Initial token

make sure you setup the app with redirect_url = https://local.aspgenerator.com:3443/oahth and add this name into host file so you can access it from your browser

```
run yarn server

then visit https://local.aspgenerator.com:3443/connect to finish the login flow, after finish the file `intuit.json` will be created with details

```

### Generate data

with intuit.json existing, run

```
  yarn dev
```
