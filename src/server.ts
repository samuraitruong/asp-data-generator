import * as dotenv from "dotenv";
import * as fs from "fs";
import OAuthClient from "intuit-oauth";
import { XeroClient } from "xero-node";
import * as https from "https";
import express from "express";
import { XERO_SCOPES } from "./constants";
import { Myob } from "./asp/myob";

dotenv.config();

const xeroClient = new XeroClient({
  clientId: process.env.XERO_CLIENT_ID || "",
  clientSecret: process.env.XERO_CLIENT_SECRET || "",
  redirectUris: [
    process.env.XERO_REDIRECT_URL ||
    "https://local.aspgenerator.com:3443/oauth/xero",
  ],
  scopes: XERO_SCOPES,
  // state: 'returnPage=my-sweet-dashboard', // custom params (optional)
  httpTimeout: 3000, // ms (optional)
});

const oauthClient = new OAuthClient({
  clientId: process.env.INTUIT_CLIENT_ID,
  clientSecret: process.env.INTUIT_CLIENT_SECRET,
  environment: "production",
  redirectUri: process.env.REDIRECT_URL,
});

const privateKey = fs.readFileSync("certs/server.key", "utf8");
const certificate = fs.readFileSync("certs/server.crt", "utf8");

const app = express();

app.get("/oauth/myob", async (req, res) => {
  const myob = new Myob();
  try {
    const token = await myob.getAccessToken(req.url);

    fs.writeFileSync("myob.json", JSON.stringify(token, null, 4));

    res.json(token);
  } catch (err) {
    res.json(err);
  }
});

app.get("/oauth/intuit", async (req, res) => {
  const parseRedirect = req.url;

  try {
    // Exchange the auth code retrieved from the **req.url** on the redirectUri
    const authResponse = await oauthClient.createToken(parseRedirect);

    fs.writeFileSync("intuit.json", JSON.stringify(authResponse, null, 4));

    res.json(authResponse);
  } catch (err) {
    res.json(err);
  }
});
app.get("/ping", (req, res) => {
  res.send("Pong");
});

app.get("/connect/intuit", (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: "testState",
  }); // can be an array of multiple scopes ex : {scope:[OAuthClient.scopes.Accounting,OAuthClient.scopes.OpenId]}

  // Redirect the authUri
  res.redirect(authUri);
});

app.get("/connect/xero", async (req, res) => {
  const consentUrl = await xeroClient.buildConsentUrl();
  res.redirect(consentUrl);
});

app.get("/connect/myob", async (req, res) => {
  const myob = new Myob();

  const consentUrl = await myob.buildAuthUrl();
  res.redirect(consentUrl);
});

app.get("/oauth/xero", async (req, res) => {
  try {
    const tokenSet = await xeroClient.apiCallback(req.url);
    fs.writeFileSync("xero.json", JSON.stringify(tokenSet, null, 4));
    res.json(tokenSet);
  } catch (err) {
    res.json(err);
  }
});

const httpsServer = https.createServer(
  { key: privateKey, cert: certificate },
  app
);

httpsServer.listen(3443, () => {
  console.log("server started at 3443 port");
});
