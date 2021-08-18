import * as dotenv from "dotenv";
import chalk from "chalk";
import * as fs from "fs";
import asyncPool from "tiny-async-pool";
import { Xero } from "./asp/xero";
import { getOptions } from "./cli";

const tokenSet = JSON.parse(fs.readFileSync("xero.json", "utf8"));

dotenv.config();

(async () => {
  const xero = new Xero(tokenSet);
  const options = await getOptions(Xero);
  try {
    await xero.refreshToken();
    await xero.fetchCommonEntities();

    if (options.entity !== "*") {
      const results = await asyncPool(5, Array(options.count), async () => {
        try {
          return await xero[`create${options.entity}`]();
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
    asyncPool(10, Array(1), async () => {
      await xero.createPurchaseOrder();
      await xero.createInvoice();
      await xero.createCreditNote();
      await xero.createManualJournal();
      await xero.createFixedAsset();
      console.log(chalk.green("finished iteration %s"), index++);
    });
  } catch (err) {
    console.log("Got error", err);
  }
  // console.log(JSON.parse(data.body))
})();
