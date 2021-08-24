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
