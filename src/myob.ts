import * as dotenv from "dotenv";
import asyncPool from "tiny-async-pool";
import { Myob } from "./asp/myob";
import { getOptions } from "./cli";

dotenv.config();

(async () => {
  const options = await getOptions(Myob, 10);
  const myob = new Myob();

  try {
    await myob.refreshToken();
    await myob.getCompanyFiles(options.orgName);
    if (!options.skipCommonEntity) {
      await myob.fetchCommonEntities();
    }
    let index = 0;
    if (options.entity !== "*") {
      const results = await asyncPool(
        options.threads,
        Array(options.count),
        async () => {
          try {
            if (++index % 100 === 0) {
              await myob.refreshToken();
            }
            return await myob[`create${options.entity}`]();
          } catch (err) {
            console.error(err);
            //swallow
          }
        }
      );
      console.log(
        "Items created: %d",
        results.flat().filter(Boolean).length,
        results.flat().filter(Boolean)
      );
      return;
    }
  } catch (err) {
    console.log("Got error", err);
  }
})();
