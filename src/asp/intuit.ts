import faker from "faker";
import moment from "moment";
import asyncPool from "tiny-async-pool";
import * as fs from "fs-extra";
import { INTUIT_ACCOUNT_ENUMS, FLAT_ACCOUNT_LIST } from "../constants";
import chalk from "chalk";

export class Intuit {
  readonly apiUrl;
  mode = "live";
  _customers: any[] = [];

  _accounts: any[] = [];

  _accountList: any[] = [];

  _items: any[] = [];

  _vendors: any[] = [];

  constructor(private client) {
    this.apiUrl = `https://quickbooks.api.this.com/v3/company/${client.getToken().realmId
      }`;
  }

  async fetchCommonEntities(mode: string) {
    this.mode = mode;
    this._customers = await this.customers();
    this._accounts = await this.accounts();
    this._accountList = await this.accountList();
    this._items = await this.items();
    this._vendors = await this.vendors();
  }

  private async createAllAccount() {
    const allAccounts = Object.entries(INTUIT_ACCOUNT_ENUMS)
      .map(([key, values]) => values.map((v) => [key, v]))
      .flat();

    asyncPool(10, allAccounts, async ([type, subtype]) => {
      await this.createAccount(type, subtype);
      console.log("Created account %s %s", type, subtype);
    });
  }

  private async post(url, model, retry = 1) {
    let postRes;
    try {
      postRes = await this.client.makeApiCall({
        url: `${this.apiUrl + url}?minorversion=59`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(model),
      });
      const output: any = Object.values(postRes.json)[0];
      console.info(
        "Created successful %s #id=%s  name = %s",
        url,
        output.Id,
        output?.Name || output?.DisplayName
      );
      return postRes.json;
    } catch (err) {
      fs.writeFileSync(`./logs${url}.json`, JSON.stringify(model, null, 4));
      if (
        retry < 4 &&
        err.authResponse.response.body.includes(
          "An unexpected error occurred while accessing or saving your data. Please wait a few minutes and try again"
        )
      ) {
        console.log(chalk.red("server error, retrying ...."), retry);
        return await this.post(url, model, retry + 1);
      }

      console.log(url, model);
      console.error(url, err.authResponse.json.Fault);
    }
  }

  async createCreditCardPayment() {
    const bankAcc = await this.rndAccount("Bank");
    const ccAcc = await this.rndAccount("CreditCard");

    const model = {
      PrivateNote: faker.finance.transactionDescription(),
      TxnDate: this.rndDate(),
      Amount: this.rndAmount(),
      BankAccountRef: {
        name: bankAcc.Name,
        value: bankAcc.Id,
      },
      CreditCardAccountRef: {
        name: ccAcc.Name,
        value: ccAcc.Id,
      },
    };

    return this.post("/creditcardpayment", model);
  }

  async createCreditMemo() {
    const cus = this.any(this._customers);
    const items = this.ranItems(this._items, 5);

    const model = {
      TxnDate: this.rndDate(),
      DocNumber: this.docNum(),
      Line: items.map((item) => ({
        DetailType: "SalesItemLineDetail",
        Amount: item.UnitPrice || 50,
        SalesItemLineDetail: {
          Qty: 1,
          TaxCodeRef: {
            value: "5",
          },
          ItemRef: {
            name: item.Name,
            value: item.Id,
          },
        },
      })),
      CustomerRef: {
        name: cus.Name,
        value: cus.Id,
      },
    };
    return this.post("/creditmemo", model);
  }

  async createJournalEntry() {
    const date = Math.floor(Math.random() * 1000);
    // const accAv = await this.rndAccount('Accounts Receivable');
    // const accAP = await this.rndAccount('Accounts Payable')
    const acc = this.any(this._accounts);

    const amout = this.rndAmount();
    const model = {
      TxnDate: this.rndDate(),
      DocNumber: this.docNum(),
      Line: [
        {
          JournalEntryLineDetail: {
            PostingType: "Debit",
            AccountRef: {
              name: acc.Name,
              value: acc.Id,
            },
          },
          DetailType: "JournalEntryLineDetail",
          Amount: amout,
          Id: "0",
          Description: faker.lorem.sentence(),
        },
        {
          JournalEntryLineDetail: {
            PostingType: "Credit",
            AccountRef: {
              name: acc.Name,
              value: acc.Id,
            },
          },
          DetailType: "JournalEntryLineDetail",
          Amount: amout,
          Id: "1",
          Description: faker.lorem.sentence(),
        },
      ],
    };
    return this.post("/journalentry", model);
  }

  async createCustomer() {
    const firstName = faker.name.firstName();
    const lastname = faker.name.lastName();

    const model = {
      FullyQualifiedName: `${firstName} ${lastname}`,
      PrimaryEmailAddr: {
        Address: faker.internet.email(),
      },
      DisplayName: `${firstName} ${lastname}`,
      Suffix: faker.name.suffix(),
      Title: faker.name.prefix(),
      MiddleName: "",
      Notes: faker.lorem.sentence(),
      FamilyName: lastname,
      PrimaryPhone: {
        FreeFormNumber: faker.phone.phoneNumber(),
      },
      CompanyName: faker.company.companyName(),
      BillAddr: {
        CountrySubDivisionCode: faker.address.state(),
        City: faker.address.cityName(),
        PostalCode: faker.address.zipCode(),
        Line1: faker.address.streetAddress(),
        Country: faker.address.countryCode(),
      },
      GivenName: firstName,
    };
    return this.post("/customer", model);
  }

  any(items: any[], requiredFields?: string[]) {
    const filtered = items.filter(Boolean);
    while (true) {
      const index = Math.floor(Math.random() * filtered.length);
      const item = filtered[index];
      if (!requiredFields) return item;

      if (requiredFields && requiredFields.length === 0) return item;
      if (
        requiredFields &&
        requiredFields.map((x) => item[x]).filter(Boolean).length ===
        requiredFields.length
      )
        return item;
    }
  }

  async rndAccount(type = "") {
    const subList = this._accounts.filter(
      (x) =>
        type === "" ||
        x.AccountType.toLowerCase() === type.toLowerCase() ||
        x.AccountSubType.toLowerCase() === type.toLowerCase() ||
        x.Name.toLowerCase().includes(type.toLowerCase())
    );
    if (type && subList.length === 0 && INTUIT_ACCOUNT_ENUMS[type]) {
      return await this.createAccount(type);
    }
    return this.any(subList);
  }

  async createDeposit() {
    const checkingAcc = await this.rndAccount("Bank");
    const accType = this.any([
      "Expense",
      "Income",
      "Other Income",
      "Other Expense",
      "Equity",
      "Other Current Asset",
    ]);
    const anyAcc = await this.rndAccount(accType);
    const model = {
      Line: [
        {
          DetailType: "DepositLineDetail",
          Amount: this.rndAmount(3000),
          DepositLineDetail: {
            AccountRef: {
              name: anyAcc.Name,
              value: anyAcc.Id,
            },
          },
        },
      ],
      DepositToAccountRef: {
        name: checkingAcc.Name,
        value: checkingAcc.Id,
      },
    };
    return this.post("/deposit", model);
  }

  async createPurchase(type = "") {
    const accountMapping = {
      CreditCard: "CreditCard",
      Cash: "Bank",
      Check: "Bank",
    };

    type = type || this.any(Object.keys(accountMapping));
    const acc = await this.rndAccount(
      type == "Cash1" ? undefined : accountMapping[type]
    );
    const cus = this.any(this._customers);
    const expenseAccounts = this.ranItems(this._accounts, 3);
    const model = {
      TxnDate: this.rndDate(),
      TxnNum: new Date().getTime(),
      PaymentType: type,
      EntityRef: {
        name: cus.Name,
        value: cus.Id,
      },
      AccountRef: {
        name: acc.Name,
        value: acc.Id,
      },
      Memo: "test",
      Line: expenseAccounts.map((expenseAccount) => ({
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: this.rndAmount(1000),
        AccountBasedExpenseLineDetail: {
          // "TaxAmount": 0,
          // "TaxInclusiveAmt": 0,
          TaxCodeRef: {
            value: "7",
          },
          AccountRef: {
            name: expenseAccount.Name,
            value: expenseAccount.Id,
          },
          CustomerRef: {
            name: cus.Name,
            value: cus.Id,
          },
        },
      })),
    };
    return this.post("/purchase", model);
  }

  rndDate() {
    const date = Math.floor(Math.random() * 761);
    return moment().subtract(date, "days").format("YYYY-MM-DD");
  }

  rndAmount(max = 2000) {
    // return faker.finance.amount();
    return +(Math.random() * max).toFixed(2);
  }

  async createPayment() {
    const customer = this.any(this._customers);
    const model = {
      TxnDate: this.rndDate(),
      TotalAmt: this.rndAmount(10000),
      CustomerRef: {
        value: customer.Id,
      },
    };
    return this.post("/payment", model);
  }

  async createItem(type = "Service") {
    const inventoryAccount = await this.rndAccount("Inventory Asset");
    const incomeAcc = await this.rndAccount("Income");
    let cogs = await this.rndAccount("SuppliesMaterialsCogs");
    if (!cogs) {
      cogs = await this.createAccount(
        "Cost of Goods Sold",
        "SuppliesMaterialsCogs"
      );
    }
    const price = this.rndAmount(100);
    const model = {
      TrackQtyOnHand: type === "Inventory",
      Name: faker.commerce.productName() + " - " + this.docNum(),
      QtyOnHand: 10,
      UnitPrice: price,
      PurchaseCost: price * 0.75,
      IncomeAccountRef: {
        name: incomeAcc.Name,
        value: incomeAcc.Id,
      },
      AssetAccountRef: {
        name: inventoryAccount.Name,
        value: inventoryAccount.Id,
      },
      InvStartDate: "2015-01-01",
      Type: type,
      ExpenseAccountRef: {
        name: cogs.Name,
        value: cogs.Id,
      },
    };
    return this.post("/item", model);
  }

  async createInvoice() {
    const customer = this.any(this._customers);
    const date = Math.floor(Math.random() * 600);
    const model = {
      TxnDate: moment().subtract(date, "days").format("YYYY-MM-DD"),
      Line: [
        {
          DetailType: "SalesItemLineDetail",
          Amount: Math.random() * 2500,
          SalesItemLineDetail: {
            TaxCodeRef: {
              value: "5",
            },
            ItemRef: {
              name: "Service",
              value: "3",
            },
          },
        },
      ],
      CustomerRef: {
        value: customer.Id,
      },
    };
    return this.post("/invoice", model);
  }

  async createAccount(AccountType?: string, AccountSubType?: string) {
    if (!AccountType && !AccountSubType) {
      const [type, subType] = this.any(FLAT_ACCOUNT_LIST);
      AccountType = type;
      AccountSubType = subType;
    }
    const AcctNum = this.docNum();
    const subName = (AccountSubType || "").replace(/([A-Z])/g, " $1").trim();
    const model = {
      AcctNum,
      Name: `${AccountType} - ${subName} #${AcctNum}`,
      AccountType,
      AccountSubType,
    };
    return this.post("/account", model);
  }

  async createVendor() {
    const companyName = faker.company.companyName() + " " + this.docNum();
    const model = {
      PrimaryEmailAddr: {
        Address: faker.internet.email(),
      },
      WebAddr: {
        URI: faker.internet.url(),
      },
      PrimaryPhone: {
        FreeFormNumber: faker.phone.phoneNumber(),
      },
      DisplayName: companyName,
      Suffix: faker.name.suffix(),
      Title: faker.name.prefix(),
      Mobile: {
        FreeFormNumber: faker.phone.phoneNumber(),
      },
      FamilyName: faker.name.lastName(),
      TaxIdentifier: faker.finance.routingNumber(),
      AcctNum: faker.finance.account(),
      CompanyName: companyName,
      BillAddr: {
        City: faker.address.cityName(),
        Country: faker.address.country(),
        Line3: faker.address.streetAddress(),
        Line2: faker.address.secondaryAddress(),
        Line1: companyName,
        PostalCode: faker.address.zipCode(),
        CountrySubDivisionCode: faker.address.countryCode(),
      },
      GivenName: faker.name.firstName(),
      PrintOnCheckName: faker.company.companyName(),
    };

    return this.post("/vendor", model);
  }

  async query(query: string) {
    let data = [];
    let page;
    let index = 0;
    const entityName = query.split(" ").pop();

    if (this.mode === "cache") {
      if (fs.existsSync("./data/intuit/" + entityName + ".json")) {
        const cached = fs.readJSONSync("./data/intuit/" + entityName + ".json");
        console.log("Read from cache %s ===> %d", entityName, cached.length);
        return cached;
      }
    }
    do {
      console.log(query);
      const res = await this.client.makeApiCall({
        url: `${this.apiUrl}/query?query=${query} STARTPOSITION ${index} MaxResults 1000&minorversion=59`,
      });
      console.log("query done");
      page = Object.values(res.json.QueryResponse)[0] as any[];

      data = [...data, ...page];
      index += page.length;
    } while (page.length === 1000);
    console.log(query + " ===> ", data.length);
    if (data && data.length > 0) {
      fs.mkdirpSync("./data/intuit/");
      fs.writeJsonSync("./data/intuit/" + entityName + ".json", data, {
        spaces: 4,
      });
    }
    return data;
  }

  async items() {
    return this.query("select * from Item");
  }

  async vendors() {
    return this.query("select * from Vendor");
  }

  async accounts() {
    return this.query("select * from Account");
  }

  parseReport(report) {
    const headers = report.Columns.Column.map((x) => x.ColTitle);
    return report.Rows.Row.map(({ ColData }) => {
      const item: any = {};
      ColData.forEach(({ value }, index) => {
        item[headers[index]] = value;
      });
      return item;
    });
  }

  async accountList() {
    const res = await this.client.makeApiCall({
      url: `${this.apiUrl}/reports/AccountList?minorversion=59`,
    });

    return this.parseReport(res.json);
  }

  async customers() {
    return this.query("select * from Customer");
  }

  ranItems(arr, maxItems) {
    const count = Math.ceil(Math.random() * maxItems);
    return Array(count)
      .fill(0)
      .map((x) => this.any(arr));
  }

  docNum() {
    return Math.random().toString().slice(3);
  }

  async createBill() {
    const items = this.ranItems(this._items, 5);
    const cus = this.any(this._customers);
    const acc = await this.rndAccount("Expense");

    const vendor = this.any(this._vendors);
    const model = {
      DocNumber: this.docNum(),
      TxnDate: this.rndDate(),
      Line: items.map((item, index) => ({
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: this.rndAmount(),
        Id: `${index + 1}`,
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: acc.Id,
          },
          CustomerRef: {
            value: cus.Id,
          },
        },
      })),
      VendorRef: {
        value: vendor.Id,
      },
    };
    return this.post("/bill", model);
  }

  async createVendorCredit() {
    const cus = this.any(this._customers);
    const accTypes = [
      "Expense",
      "Other Expense",
      "Other Current Liability",
      "Other Current Asset",
      "Other Asset",
      "Fixed Asset",
      "Cost of Goods Sold",
    ];
    const bankAcc = await this.rndAccount(this.any(accTypes));

    const ap = await this.rndAccount("Accounts Payable");
    const vendor = this.any(this._vendors);
    const amt = this.rndAmount(500);
    const model = {
      TotalAmt: amt,
      TxnDate: this.rndDate(),
      Line: [
        {
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: amt,
          Id: "1",
          AccountBasedExpenseLineDetail: {
            TaxCodeRef: {
              value: "7",
            },
            AccountRef: {
              name: bankAcc.Name,
              value: bankAcc.Id,
            },
            BillableStatus: "Billable",
            CustomerRef: {
              name: cus.Name,
              value: cus.Id,
            },
          },
        },
      ],
      APAccountRef: {
        name: ap.Name,
        value: ap.Id,
      },
      VendorRef: {
        name: vendor.Name,
        value: vendor.Id,
      },
    };
    return this.post("/vendorcredit", model);
  }

  async createSaleReciept() {
    const items = this.ranItems(this._items, 5);
    const cus = this.any(this._customers);

    const model = {
      DocNumber: this.docNum(),
      TxnDate: this.rndDate(),
      CustomerRef: {
        name: cus.Name,
        value: cus.Id,
      },
      Line: items.map((item, index) => ({
        Description: `${item.Name} sale reciept #${new Date().getTime()}`,
        DetailType: "SalesItemLineDetail",

        SalesItemLineDetail: {
          TaxCodeRef: {
            value: "5",
          },
          Qty: 1,
          UnitPrice: item.UnitPrice || 10,
          ItemRef: {
            name: item.Name,
            value: item.Id,
          },
        },
        LineNum: index + 1,
        Amount: item.UnitPrice || 10,
        Id: "1",
      })),
    };
    return this.post("/salesreceipt", model);
  }

  async createPurchaseOrder() {
    const items = this.ranItems(this._items, 5);

    const cus = this.any(this._customers, ["Id"]);
    const vendor = this.any(this._vendors);
    let apAcc = await this.rndAccount("Accounts Payable");
    if (!apAcc) {
      apAcc = await this.createAccount("Accounts Payable", undefined);
    }
    let total = 0;
    const model = {
      DocNumber: new Date().getTime(),
      TxnDate: this.rndDate(),
      TotalAmt: 25.0,
      Line: items.map((item, index) => {
        total += item.UnitPrice || 25;

        return {
          DetailType: "ItemBasedExpenseLineDetail",
          Amount: item.UnitPrice || 25,
          Id: `${index + 1}`,
          ItemBasedExpenseLineDetail: {
            ItemRef: {
              name: item.Name,
              value: item.Id,
            },
            CustomerRef: {
              name: cus.Name,
              value: cus.id,
            },
            Qty: 1,
            TaxCodeRef: {
              value: "NON",
            },
            BillableStatus: "NotBillable",
            UnitPrice: item.UnitPrice || 25,
          },
        };
      }),
      APAccountRef: {
        name: apAcc.Name,
        value: apAcc.Id,
      },
      VendorRef: {
        name: vendor.DisplayName,
        value: vendor.Id,
      },
      ShipTo: {
        // name: cus.Name,
        value: cus.Id,
      },
    };
    model.TotalAmt = total;

    return this.post("/purchaseorder", model);
  }

  async createCommonEntity() {
    await this.createCustomer();
    await this.createItem();
    await this.createVendor();
    await this.createAccount();
  }

  async createData() {
    await this.createJournalEntry();
    await this.createPurchase();
    await this.createInvoice();
    await this.createPayment();
    await this.createSaleReciept();
    await this.createPurchaseOrder();
    await this.createBill();
    await this.createCreditCardPayment();
    await this.createVendorCredit();
    await this.createCreditMemo();
  }
}
