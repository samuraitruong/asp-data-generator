import * as dotenv from "dotenv";
import asyncPool from "tiny-async-pool";
import { Myob } from "./asp/myob";
import { getOptions } from "./cli";

dotenv.config();

(async () => {
  const myob = new Myob();
  const options = await getOptions(Myob);

  try {
    await myob.refreshToken();
    await myob.getCompanyFiles();
    await myob.fetchCommonEntities();

    if (options.entity !== "*") {
      const results = await asyncPool(10, Array(options.count), async () => {
        try {
          return await myob[`create${options.entity}`]();
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

    // let index = 0;
    // asyncPool(10, Array(1), async () => {
    //   await myob.createPurchaseOrder();
    //   await myob.createInvoice();
    //   await myob.createCreditNote();
    //   await myob.createManualJournal();
    //   await myob.createFixedAsset();
    //   console.log(chalk.green("finished iteration %s"), index++);
    // });
  } catch (err) {
    console.log("Got error", err);
  }
  // console.log(JSON.parse(data.body))
})();
