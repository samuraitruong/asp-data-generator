import * as dotenv from "dotenv";
import chalk from "chalk";
import * as fs from "fs";
import OAuthClient from "intuit-oauth";
import { Intuit } from "./asp/intuit";
import asyncPool from "tiny-async-pool";
import { getOptions } from "./cli";

dotenv.config();

(async () => {
  const options = await getOptions(Intuit, 10);

  console.log("Refresh Token");

  const intuit = new Intuit();
  await intuit.refreshToken();
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
