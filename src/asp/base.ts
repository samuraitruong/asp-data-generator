import faker from "faker";
import moment from "moment";
import hashObject from "object-hash";

export class Base {
  constructor(private substractDates: number, private dateFormat: string) { }
  transactionDate() {
    const date = Math.floor(Math.random() * this.substractDates);
    const m = moment().subtract(date, "days");
    if (this.dateFormat === "iso") {
      return m.toISOString();
    }
    return m.format(this.dateFormat);
  }
  any(items: any[]) {
    if (items.length === 0) return null;

    const index = Math.floor(Math.random() * items.length);
    return items[index];
  }
  rndAmount(max = 2000) {
    // return faker.finance.amount();
    return +(Math.random() * max).toFixed(2);
  }

  uniqueNumber() {
    return (
      Math.random()
        .toString(36)
        .replace(/[^a-z]+/gi, "")
        .substr(0, 3)
        .toUpperCase() +
      "-" +
      faker.datatype.number()
    );
  }

  ranItems<T>(arr: T[], maxItems) {
    const count = Math.ceil(Math.random() * maxItems);
    const items = Array(count)
      .fill(0)
      .map((x) => this.any(arr));
    const unique = items.reduce((a, b) => {
      a[hashObject[b]] = b;
      return a;
    }, {});
    return Object.values(unique) as T[];
  }
}
