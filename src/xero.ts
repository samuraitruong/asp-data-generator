import * as dotenv from "dotenv";
import asyncPool from "tiny-async-pool";
import { Xero } from "./asp/xero";
import { getOptions } from "./cli";

dotenv.config();

(async () => {
  const options = await getOptions(Xero, 5, 780);
  const xero = new Xero(options.days);
  try {
    await xero.refreshToken(options.orgName);
    await xero.fetchCommonEntities();

    const results = await asyncPool(
      options.threads,
      Array(options.count),
      async () => {
        try {
          return await xero[`create${options.entity}`]();
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
  } catch (err) {
    console.log("Got error", err);
  }
})();
