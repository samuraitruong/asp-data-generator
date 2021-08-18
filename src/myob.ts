import * as dotenv from "dotenv";
import asyncPool from "tiny-async-pool";
import { Myob } from "./asp/myob";
import yargs from "yargs";
import { getClassMethods } from "./utils";

const createMethods = getClassMethods(Myob);
const argv = yargs(process.argv).options({
  entity: { type: "string", choices: ["*", ...createMethods] },
  count: { type: "number", default: 10 },
  mode: { choices: ["live", "cache"], default: "live" },
}).argv;

dotenv.config();

(async () => {
  const myob = new Myob();
  const options = await argv;

  try {
    await myob.refreshToken();
    await myob.getCompanyFiles();
    await myob.fetchCommonEntities();

    if (options.entity !== "*") {
      const results = await asyncPool(10, Array(options.count), async () =>
        myob[`create${options.entity}`]()
      );
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
