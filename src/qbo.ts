import * as dotenv from "dotenv";
import chalk from "chalk";
import * as fs from "fs";
import OAuthClient from "intuit-oauth";
import { Intuit } from "./asp/intuit";
import asyncPool from "tiny-async-pool";
import { getOptions } from "./cli";

const token = JSON.parse(fs.readFileSync("intuit.json", "utf8")).token;

dotenv.config();

(async () => {
  const options = await getOptions(Intuit, 10);

  const oauthClient = new OAuthClient({
    clientId: process.env.INTUIT_CLIENT_ID,
    clientSecret: process.env.INTUIT_CLIENT_SECRET,
    environment: "production",
    redirectUri: process.env.REDIRECT_URL,
    token,
  });
  console.log("Refresh Token");
  await oauthClient.refresh();

  const intuit = new Intuit(oauthClient);
  console.log("fetching common entities");
  await intuit.fetchCommonEntities(options.mode);
  const results = await asyncPool(
    options.threads,
    Array(options.count),
    async () => {
      try {
        return await intuit[`create${options.entity}`]();
      } catch (err) {
        console.log(err);
        //swallow
      }
    }
  );
  console.log(
    "Items created: %d",
    results.filter(Boolean).length,
    results.filter(Boolean)
  );
})();
