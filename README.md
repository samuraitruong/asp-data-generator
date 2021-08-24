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

MYOB_CLIENT_ID={MYOB_CLIENT_ID}
MYOB_CLIENT_SECRET={MYOB_CLIENT_SECRET}
MYOB_REDIRECT_URL=https://local.aspgenerator.com:3443/oauth/xero

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

### MYOB

- visit https://local.aspgenerator.com:3443/connect/myob
- Follow the login process and select the org
- callback will be come back, the access token will be retreived and store as myob.json file

### Generate data

if the connection are multiple org, xero m

### QBO

Finished the login process above to generate intuit.json

You can update src/qbo.ts to disable the entity that you dont want or increase the number of item to insert

```
  yarn qbo --help

```

### XERO

Finished the login process above to generate xero.json

You can update src/xero.ts to disable the entity that you dont want or increase the number of item to insert

```
  yarn qbo --help

```

### MYOB

Finished the login process above to generate xero.json

You can update src/xero.ts to disable the entity that you dont want or increase the number of item to insert

```
  yarn myob --help

```

## TODO

- Fix business logic violation when using random account or other entities
