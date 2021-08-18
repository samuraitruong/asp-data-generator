import faker from "faker";

export class Base {
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
}
