import * as dotenv from "dotenv";
import * as fs from "fs";
import OAuthClient from 'intuit-oauth';
import { Intuit } from './intuit';
import asyncPool from "tiny-async-pool";

const token = JSON.parse(fs.readFileSync("intuit.json", "utf8")).token;

dotenv.config();


(async () => {

  const oauthClient = new OAuthClient({
    clientId: process.env.INTUIT_CLIENT_ID,
    clientSecret: process.env.INTUIT_CLIENT_SECRET,
    environment: 'production',
    redirectUri: process.env.REDIRECT_URL,
    token
  });
  await oauthClient.refresh();

  try {
    const intuit = new Intuit(oauthClient);
    await intuit.fetchCommonEntities();
    // await asyncPool(10, Array(1), async () => intuit.createPurchase())

    // return;

    let index = 0;
    asyncPool(10, Array(1000), async () => {
      await intuit.createPurchase();
      await intuit.createInvoice();
      await intuit.makePayment();
      await intuit.createSaleReciept();
      console.log("finished iteration %s", index++)
    }
    );
  }
  catch (err) {
    console.log("Got error", err)
  }
  // console.log(JSON.parse(data.body))

})()
