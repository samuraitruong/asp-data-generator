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
