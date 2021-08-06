import * as dotenv from "dotenv";
import * as fs from 'fs';
import OAuthClient from 'intuit-oauth'

dotenv.config();
let token;


const oauthClient = new OAuthClient({
  clientId: process.env.INTUIT_CLIENT_ID,
  clientSecret: process.env.INTUIT_CLIENT_SECRET,
  environment: 'production',
  redirectUri: process.env.REDIRECT_URL,
});

var https = require('https');
var privateKey = fs.readFileSync('certs/server.key', 'utf8');
var certificate = fs.readFileSync('certs/server.crt', 'utf8');


import express from "express";


const app = express();

app.use('/oauth', async (req, res) => {
  const parseRedirect = req.url;

  try {
    // Exchange the auth code retrieved from the **req.url** on the redirectUri
    const authResponse = await oauthClient
      .createToken(parseRedirect)

    token = authResponse.token;

    fs.writeFileSync("intuit.json", JSON.stringify(authResponse, null, 4));

    res.json(authResponse)
  }
  catch (err) {
    res.json(err)
  }
});

app.use("/connect", (req, res) => {
  console.log(req.query);
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: 'testState',
  }); // can be an array of multiple scopes ex : {scope:[OAuthClient.scopes.Accounting,OAuthClient.scopes.OpenId]}

  // Redirect the authUri
  res.redirect(authUri);

})

var httpsServer = https.createServer({ key: privateKey, cert: certificate }, app);

httpsServer.listen(3443)
