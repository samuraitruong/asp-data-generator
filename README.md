# asp-data-generator

The simple script to generate asp data for testing purpose

## .env

```
INTUIT_CLIENT_ID={INTUIT_CLIENT_ID}
INTUIT_CLIENT_SECRET={INTUIT_CLIENT_SECRET}
REDIRECT_URL=https://local.aspgenerator.com:3443/oauth/intuit

XERO_CLIENT_ID={XERO_CLIENT_ID}
XERO_CLIENT_SECRET={XERO_CLIENT_SECRET}
XERO_REDIRECT_URL=https://local.aspgenerator.com:3443/oauth/xero

```

## Connect the asp org

```sh
run yarn server
```

### QBO

- visit https://local.aspgenerator.com:3443/connect/intuit
- Follow the login process and select the org
- callback will be come back, the access token will be retreived and store as intuit.json file

### XERO

- visit https://local.aspgenerator.com:3443/connect/xero
- Follow the login process and select the org
- callback will be come back, the access token will be retreived and store as xero.json file

### Generate data

### QBO

Finished the login process above to generate intuit.json

You can update src/qbo.ts to disable the entity that you dont want or increase the number of item to insert

```
  yarn qbo

```

### XERO

Finished the login process above to generate xero.json

You can update src/xero.ts to disable the entity that you dont want or increase the number of item to insert

```
  yarn qbo

```
