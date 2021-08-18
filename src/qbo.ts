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
  const options = await getOptions(Intuit);

  const oauthClient = new OAuthClient({
    clientId: process.env.INTUIT_CLIENT_ID,
    clientSecret: process.env.INTUIT_CLIENT_SECRET,
    environment: "production",
    redirectUri: process.env.REDIRECT_URL,
    token,
  });
  await oauthClient.refresh();

  try {
    const intuit = new Intuit(oauthClient);
    await intuit.fetchCommonEntities(options.mode);
    if (options.entity !== "*") {
      const results = await asyncPool(10, Array(options.count), async () => {
        try {
          return await intuit[`create${options.entity}`]();
        } catch (err) {
          //swallow
        }
      });
      console.log(
        "Items created: %d",
        results.filter(Boolean).length,
        results.filter(Boolean)
      );
      return;
    }

    let index = 0;

    asyncPool(10, Array(1000), async () => {
      intuit.createCreditMemo();
      await intuit.createJournalEntry();
      await intuit.createPurchase();
      await intuit.createInvoice();
      await intuit.createPayment();
      await intuit.createSaleReciept();
      await intuit.createPurchaseOrder();
      await intuit.createBill();
      await intuit.createCreditCardPayment();
      await intuit.createVendorCredit();
      console.log(chalk.green("finished iteration %s"), index++);
    });
  } catch (err) {
    console.log("Got error", err);
  }
})();
