import yargs from "yargs";
import moment from "moment";

export function getClassMethods(className: any) {
  const ret = new Set();

  function methods(obj) {
    if (obj) {
      const ps = Object.getOwnPropertyNames(obj);

      ps.forEach((p) => {
        if (obj[p] instanceof Function) {
          ret.add(p);
        } else {
          //can add properties if needed
        }
      });

      methods(Object.getPrototypeOf(obj));
    }
  }

  methods(className.prototype);

  return Array.from(ret)
    .filter((x: string) => x.startsWith("create"))
    .map((x: string) => x.replace("create", ""));
}

export async function getOptions(instance, threads = 10) {
  const createMethods = getClassMethods(instance);
  const defaultEndDate = moment()
    .subtract(1, "month")
    .endOf("month")
    .format("YYYY-MM-DD");
  const defaultStartDate = moment(defaultEndDate)
    .subtract(1, "year")
    .add(1, "week")
    .startOf("month")
    .format("YYYY-MM-DD");
  const argv = yargs(process.argv).options({
    entity: { type: "string", choices: createMethods },
    count: { type: "number", default: 10 },
    mode: { choices: ["live", "cache"], default: "live" },
    orgName: { type: "string", require: false },
    threads: { type: "number", default: threads },
    startDate: { type: "string", default: defaultStartDate },
    endDate: { type: "string", default: defaultEndDate },
    skipCommonEntity: {
      name: "skip-common-entity",
      type: "boolean",
      default: false,
    },
  }).argv;
  return await argv;
}
