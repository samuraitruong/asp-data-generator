import qs from "qs";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import faker, { fake } from "faker";
import { Base } from "./base";
import moment from "moment";

export class Myob extends Base {
  clientId = process.env.MYOB_CLIENT_ID;
  clientSeret = process.env.MYOB_CLIENT_SECRET;
  companyFileUrl = "https://api.myob.com";
  tokenSet: any = {};
  items: [];
  customers: [];
  suppliers: [];
  taxCodes: [];
  accounts: [];
  jobs: [];
  constructor() {
    super();
    this.clientId = process.env.MYOB_CLIENT_ID;
    this.clientSeret = process.env.MYOB_CLIENT_SECRET;
    if (fs.existsSync("myob.json")) {
      this.tokenSet = fs.readJSONSync("myob.json");
    }
  }
  anyUID(items) {
    return {
      UID: this.any(items).UID,
    };
  }
  safeNum(n: number) {
    return +n.toFixed(2);
  }
  randTax(type?: string) {
    const filtering = this.taxCodes.filter(
      (x: any) =>
        type === undefined ||
        x.Code === type ||
        x.Description?.includes(type) ||
        x.Type === type
    );

    return this.anyUID(filtering);
  }

  randAccount(type?: string, level?: number, header?: boolean) {
    // console.log(type, level, header);
    const filtering = this.accounts
      .filter((x: any) => type === undefined || x.Type === type)
      .filter((x: any) => !level || x.Level === level)
      .filter((x: any) => x.IsHeader === header);

    return this.any(filtering);
  }
  buildAuthUrl() {
    return `https://secure.myob.com/oauth2/account/authorize?client_id=${this.clientId}&redirect_uri=${process.env.MYOB_REDIRECT_URL}&response_type=code&scope=CompanyFile la.global`;
  }

  async getAccessToken(callbackUrl: string) {
    const query = callbackUrl.split("?").pop();
    const parsed = qs.parse(query);
    const postData = {
      client_id: this.clientId,
      client_secret: this.clientSeret,
      scope: "CompanyFile",
      code: parsed.code,
      redirect_uri: process.env.MYOB_REDIRECT_URL,
      grant_type: "authorization_code",
    };

    const res = await axios.post(
      "https://secure.myob.com/oauth2/v1/authorize",
      qs.stringify(postData),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    fs.writeJsonSync("myob.json", res.data);
    this.tokenSet = res.data;
    return res.data;
  }

  defaultHeaders() {
    return {
      headers: {
        Authorization: "Bearer " + this.tokenSet.access_token,
        //'x-myobapi-cftoken: [Base64Encode(username:password)]'
        "x-myobapi-key": this.clientId,
        "x-myobapi-version": "v2",
      },
    };
  }

  async refreshToken() {
    const postData = {
      client_id: this.clientId,
      client_secret: this.clientSeret,
      refresh_token: this.tokenSet.refresh_token,
      grant_type: "refresh_token",
    };
    const res = await axios.post(
      "https://secure.myob.com/oauth2/v1/authorize",
      qs.stringify(postData),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    fs.writeJsonSync("myob.json", res.data);
    this.tokenSet = res.data;

    return res.data;
  }

  async getCompanyFiles() {
    const res = await axios.get(
      `https://api.myob.com/accountright/`,
      this.defaultHeaders()
    );
    this.companyFileUrl = res.data[0].Uri;
    fs.writeJSONSync("myob_companyfiles.json", res.data);
    return res.data;
  }

  async get(url) {
    const urlWithQuery =
      url + (url.includes("?") ? "&$top=1000" : "?$top=1000");
    const res = await axios.get(
      `${this.companyFileUrl}/${urlWithQuery}`,
      this.defaultHeaders()
    );
    console.log("Fetch %s -> %d", url, res.data.Items.length);
    const data = res.data.Items || res.data;
    const entity = url.split("?")[0];
    const filePath = "./data/myob/" + entity + ".json";
    fs.mkdirsSync(path.dirname(filePath));
    fs.writeJSONSync(filePath, data, { spaces: 4 });
    return data;
  }
  async fetchCommonEntities() {
    this.taxCodes = await this.get("GeneralLedger/TaxCode");
    this.accounts = await this.get("GeneralLedger/Account");
    this.jobs = await this.get("GeneralLedger/Job");
    this.customers = await this.get("Contact/Customer");
    this.items = await this.get("Inventory/Item");
    this.suppliers = await this.get("Contact/Supplier");
  }

  async post(url, model, fieldName = "UID", retry = 1) {
    try {
      await axios.post(
        `${this.companyFileUrl}/${url}`,
        model,
        this.defaultHeaders()
      );
      console.log("Created %s %s = %s", url, fieldName, model[fieldName]);
      return model[fieldName];
    } catch (err) {
      const errorCode = err.response.data.Errors?.[0]?.Name;
      if (
        [
          "InternalError",
          "IncorrectRowVersionSupplied",
          "RateLimitError",
        ].includes(errorCode) &&
        retry <= 15
      ) {
        console.log(
          "Retrying request in 1 sec as error %s #%d",
          errorCode,
          retry
        );
        await new Promise((r) => setTimeout(r, 1000));
        return this.post(url, model, fieldName, retry + 1);
      }

      fs.mkdirpSync("logs/myob/" + url);
      fs.writeJsonSync(
        "logs/myob/" + url + ".json",
        { model, response: err.response.data },
        { spaces: 4 }
      );
      console.log(url, err.response.data);
    }
  }

  async createInventoryItem() {
    const IsBought = this.any([true, false]);
    const model = {
      IsBought,
      IsSold: !IsBought,
      Number: this.uniqueNumber(),
      Name: faker.commerce.product(),
      IsActive: true,
      Description: faker.lorem.sentence(),
      IncomeAccount: {
        UID: this.randAccount("Income", undefined, false).UID,
      },
      ExpenseAccount: {
        UID: this.randAccount("Expense", undefined, false).UID,
      },
      BuyingDetails: {
        TaxCode: this.anyUID(this.taxCodes),
        StandardCost: this.rndAmount(100),
        BuyingUnitOfMeasure: this.any(["can", "box", "item", "kg", "pair"]),
      },
      SellingDetails: {
        TaxCode: this.randTax("GST"),
        BuyingUnitOfMeasure: this.any(["can", "box", "item", "kg", "pair"]),
        BaseSellingPrice: this.rndAmount(100),
      },
    };
    return this.post("Inventory/Item", model, "Number");
  }

  async createCustomer() {
    const model = {
      LastName: faker.name.findName(),
      FirstName: faker.name.lastName(),
      CompanyName: faker.company.companyName(),
      IsIndividual: Math.random() > 0.5,
      DisplayID: this.uniqueNumber(),
      Notes: faker.lorem.sentence(),
      Addresses: [
        {
          Street: faker.address.streetAddress(),
          City: faker.address.cityName(),
          State: faker.address.state(),
          PostCode: faker.address.zipCode(),
          Country: faker.address.country(),
          Email: faker.internet.email(),
          Phone1: faker.phone.phoneNumber(),
          Website: faker.internet.domainName(),
          ContactName: faker.name.findName(),
        },
        {
          Street: faker.address.streetAddress(),
          City: faker.address.cityName(),
          State: faker.address.state(),
          PostCode: faker.address.zipCode(),
          Country: faker.address.country(),
          Email: faker.internet.email(),
          Phone1: faker.phone.phoneNumber(),
          Website: faker.internet.domainName(),
          ContactName: faker.name.findName(),
        },
      ],
      SellingDetails: {
        TaxCode: this.randTax("GST"),
        FreightTaxCode: this.randTax("GST"),
      },
    };
    return this.post("Contact/Customer", model, "DisplayID");
  }

  async createSupplier() {
    const model = {
      LastName: faker.name.findName(),
      FirstName: faker.name.lastName(),
      CompanyName: faker.company.companyName(),
      IsIndividual: Math.random() > 0.5,
      DisplayID: this.uniqueNumber(),
      Notes: faker.lorem.sentence(),
      Addresses: [
        {
          Street: faker.address.streetAddress(),
          City: faker.address.cityName(),
          State: faker.address.state(),
          PostCode: faker.address.zipCode(),
          Country: faker.address.country(),
          Email: faker.internet.email(),
          Phone1: faker.phone.phoneNumber(),
          Website: faker.internet.domainName(),
          ContactName: faker.name.findName(),
        },
        {
          Street: faker.address.streetAddress(),
          City: faker.address.cityName(),
          State: faker.address.state(),
          PostCode: faker.address.zipCode(),
          Country: faker.address.country(),
          Email: faker.internet.email(),
          Phone1: faker.phone.phoneNumber(),
          Website: faker.internet.domainName(),
          ContactName: faker.name.findName(),
        },
      ],
      BuyingDetails: {
        TaxCode: {
          UID: this.any(this.taxCodes).UID,
        },
        FreightTaxCode: {
          UID: this.any(this.taxCodes).UID,
        },
        ExpenseAccount: this.randAccount("Expense"),
      },
    };
    return this.post("Contact/Supplier", model, "DisplayID");
  }

  async createJob() {
    const model = {
      Number: this.uniqueNumber(),
      Name: faker.commerce.productName(),
      Description: faker.lorem.sentence(),
    };
    return this.post("GeneralLedger/Job", model, "UID");
  }

  rndDate() {
    const date = Math.floor(Math.random() * 370);
    return moment().subtract(date, "days").toDate().toISOString();
  }

  async createGeneralJournal() {
    const amount = this.rndAmount();
    const job = { UID: this.any(this.jobs).UID };
    const model = {
      DisplayID: this.uniqueNumber(),
      DateOccurred: this.rndDate(),
      Memo: faker.finance.transactionDescription(),
      Lines: [
        {
          Account: {
            UID: this.randAccount("AccountsPayable", undefined, false).UID,
          },
          // Job: job,
          Memo: faker.lorem.sentence(),
          TaxCode: this.any(this.taxCodes),
          Amount: amount,
          IsCredit: false,
          TaxAmount: 0,
          IsOverriddenTaxAmount: false,
        },
        {
          Account: {
            UID: this.randAccount("AccountsReceivable", undefined, false).UID,
          },
          //  Job: job,
          Memo: faker.lorem.sentence(),
          TaxCode: this.any(this.taxCodes),
          Amount: amount,
          IsCredit: true,
          TaxAmount: 0,
          IsOverriddenTaxAmount: false,
        },
      ],
    };
    return this.post("GeneralLedger/GeneralJournal", model, "UID");
  }

  async createAccount() {
    const accountMapping = {
      Asset: [
        "Bank",
        "AccountReceivable",
        "OtherCurrentAsset",
        "FixedAsset",
        "OtherAsset",
      ],
      Liability: [
        "CreditCard",
        "AccountsPayable",
        "OtherCurrentLiability",
        "LongTermLiability",
        "OtherLiability",
      ],
      Equity: ["Equity"],
      Income: ["Income"],
      CostOfSales: ["CostOfSales"],
      Expense: ["Expense"],
      OtherIncome: ["OtherIncome"],
      OtherExpense: ["OtherExpense"],
    };

    const Classification = this.any(Object.keys(accountMapping));
    const Type = this.any(accountMapping[Classification]);
    const IsHeader = Math.random() < 0.2;
    let ParentAccount = undefined;

    if (!IsHeader || IsHeader) {
      ParentAccount = this.randAccount(
        Classification,
        this.any([1, 2, 3]),
        true
      );
    }

    const model = {
      Name: Type + " - " + faker.finance.accountName(),
      DisplayID: this.uniqueNumber(),
      Classification,
      Type,
      //Number: 9901,
      Description: faker.lorem.sentence(),
      IsActive: true,
      IsHeader,
      TaxCode: { UID: this.any(this.taxCodes).UID },
      ParentAccount,
    };
    // console.log(model);
    return this.post("GeneralLedger/Account", model, "DisplayID");
  }
  async createSaleCustomerPayment() {
    // need to query the customer invoice and place the payment.
    const invoices = await this.get("Sale/Invoice?status=Open");
    const invoice = this.any(invoices.filter((x) => x.BalanceDueAmount > 0));

    const model = {
      PayFrom: "Account",
      Account: { UID: this.randAccount("Bank", undefined, false).UID },
      Customer: invoice.Customer,
      PayeeAddress: faker.address.streetAddress(),
      StatementParticulars: "",
      PaymentNumber: this.uniqueNumber(),
      Date: this.rndDate(),
      AmountPaid: this.rndAmount(300),
      Memo: faker.finance.transactionDescription(),
      Invoices: [
        {
          UID: invoice.UID,
          AmountApplied: invoice.BalanceDueAmount,
          Type: "Invoice",
        },
      ],
      DeliveryStatus: "Print",
      ForeignCurrency: null,
    };

    return await this.post("Sale/CustomerPayment", model, "PaymentNumber");
  }

  async createSaleInvoiceItem() {
    const item = this.any(this.items.filter((x: any) => x.IsSold));
    const unit = Math.ceil(Math.random() * 20);
    const allowAccountType = this.any([
      "Income",
      "CostOfSales",
      "OtherIncome",
      "Expense",
    ]);
    const model = {
      Number: this.uniqueNumber(),
      Date: this.rndDate(),
      SupplierInvoiceNumber: null,
      Customer: this.anyUID(this.customers),
      ShipToAddress: faker.address.streetAddress(),
      Terms: {
        PaymentIsDue: "DayOfMonthAfterEOM",
        DiscountDate: 1,
        BalanceDueDate: 30,
        DiscountForEarlyPayment: 0,
        MonthlyChargeForLatePayment: 0,
        DiscountExpiryDate: this.rndDate(),
        Discount: 0,
        DueDate: this.rndDate(),
      },
      IsTaxInclusive: false,
      IsReportable: false,
      Lines: [
        {
          Type: "Transaction",
          Description: faker.lorem.sentence(),
          BillQuantity: item.SellingDetails.BaseSellingPrice,
          ReceivedQuantity: item.SellingDetails.BaseSellingPrice,
          BackorderQuantity: 0,
          Account: {
            UID: this.randAccount(allowAccountType, undefined, false).UID,
          },
          Total: this.safeNum(item.SellingDetails.BaseSellingPrice * unit),
          UnitPrice: item.SellingDetails.BaseSellingPrice,
          Job: null,
          DiscountPercent: 0,
          TaxCode: this.randTax("GST_VAT"),
          Item: { UID: item.UID },
          CostOfGoodsSold: 1,
        },
      ],
      Subtotal: this.safeNum(item.SellingDetails.BaseSellingPrice * unit),
      Freight: 0,
      FreightTaxCode: this.randTax("GST_VAT"),
      TotalTax: this.safeNum(item.SellingDetails.BaseSellingPrice * unit * 0.1),
      TotalAmount: this.safeNum(
        item.SellingDetails.BaseSellingPrice * unit * 1.1
      ),
      Category: null,
      Comment: faker.lorem.sentence(),
      ShippingMethod: null,
      PromisedDate: null,
      JournalMemo: faker.lorem.sentence(),
      BillDeliveryStatus: "Print",
      AppliedToDate: 0,
      BalanceDueAmount: this.safeNum(
        item.SellingDetails.BaseSellingPrice * unit * 1.1
      ),
      Status: "Open",
      LastPaymentDate: null,
      Order: null,
      ForeignCurrency: null,
    };
    return this.post("Sale/Invoice/Item", model, "Number");
  }

  async createSaleInvoiceService() {
    const item = this.any(this.items.filter((x: any) => x.IsSold));
    const unit = Math.ceil(Math.random() * 20);
    const allowAccountType = this.any([
      "Income",
      "CostOfSales",
      "OtherIncome",
      "Expense",
    ]);
    const model = {
      Number: this.uniqueNumber(),
      Date: this.rndDate(),
      SupplierInvoiceNumber: null,
      Customer: this.anyUID(this.customers),
      ShipToAddress: faker.address.streetAddress(),
      Terms: {
        PaymentIsDue: "DayOfMonthAfterEOM",
        DiscountDate: 1,
        BalanceDueDate: 30,
        DiscountForEarlyPayment: 0,
        MonthlyChargeForLatePayment: 0,
        DiscountExpiryDate: this.rndDate(),
        Discount: 0,
        DueDate: this.rndDate(),
      },
      IsTaxInclusive: false,
      IsReportable: false,
      Lines: [
        {
          Type: "Transaction",
          Description: faker.lorem.sentence(),
          BillQuantity: unit,
          ReceivedQuantity: unit,
          BackorderQuantity: 0,
          Account: {
            UID: this.randAccount(allowAccountType, undefined, false).UID,
          },
          Total: this.safeNum(item.SellingDetails.BaseSellingPrice * unit),
          UnitPrice: item.SellingDetails.BaseSellingPrice,
          Job: null,
          DiscountPercent: 0,
          TaxCode: this.randTax("GST_VAT"),
          Item: { UID: item.UID },
          CostOfGoodsSold: 1,
        },
      ],
      Subtotal: this.safeNum(item.SellingDetails.BaseSellingPrice * unit),
      Freight: 0,
      FreightTaxCode: this.randTax("GST_VAT"),
      TotalTax: this.safeNum(item.SellingDetails.BaseSellingPrice * unit * 0.1),
      TotalAmount: this.safeNum(
        item.SellingDetails.BaseSellingPrice * unit * 1.1
      ),
      Category: null,
      Comment: faker.lorem.sentence(),
      ShippingMethod: null,
      PromisedDate: null,
      JournalMemo: faker.lorem.sentence(),
      BillDeliveryStatus: "Print",
      AppliedToDate: 0,
      BalanceDueAmount: this.safeNum(
        item.SellingDetails.BaseSellingPrice * unit * 1.1
      ),
      Status: "Open",
      LastPaymentDate: null,
      Order: null,
      ForeignCurrency: null,
    };
    return this.post("Sale/Invoice/Service", model, "Number");
  }

  private getPurchaseModel() {
    const item = this.any(this.items.filter((x: any) => x.IsBought));
    const unit = Math.ceil(Math.random() * 20);
    const model = {
      Number: this.uniqueNumber(),
      Date: this.rndDate(),
      SupplierInvoiceNumber: this.uniqueNumber(),
      Supplier: this.any(this.suppliers),
      ShipToAddress: faker.address.streetAddress(),
      Terms: {
        PaymentIsDue: "DayOfMonthAfterEOM",
        DiscountDate: 1,
        BalanceDueDate: 30,
        DiscountForEarlyPayment: 0,
        MonthlyChargeForLatePayment: 0,
        DiscountExpiryDate: this.rndDate(),
        Discount: 0,
        DueDate: this.rndDate(),
      },
      IsTaxInclusive: false,
      IsReportable: false,
      Lines: [
        {
          Type: "Transaction",
          Description: faker.lorem.sentence(),
          BillQuantity: unit,
          ReceivedQuantity: unit,
          BackorderQuantity: 0,
          Total: this.safeNum(item.BuyingDetails.StandardCost * unit),
          UnitPrice: item.BuyingDetails.StandardCost,
          Job: null,
          DiscountPercent: 0,
          TaxCode: this.randTax("GST_VAT"),
          Item: item,
        },
      ],
      Subtotal: this.safeNum(item.BuyingDetails.StandardCost * unit),
      Freight: 0,
      FreightTaxCode: this.randTax("GST_VAT"),
      TotalTax: this.safeNum(item.BuyingDetails.StandardCost * unit * 0.1),
      TotalAmount: this.safeNum(item.BuyingDetails.StandardCost * unit * 1.1),
      Category: null,
      Comment: faker.lorem.paragraph(),
      ShippingMethod: null,
      PromisedDate: this.rndDate(),
      JournalMemo: faker.finance.transactionDescription(),
      BillDeliveryStatus: "Print",
      AppliedToDate: 0,
      BalanceDueAmount: this.safeNum(
        item.BuyingDetails.StandardCost * unit * 1.1
      ),
      Status: "Open",
      LastPaymentDate: null,
      Order: null,
      ForeignCurrency: null,
    };
    return model;
  }
  async createPurchaseOrderItem() {
    const model = this.getPurchaseModel();
    return this.post("Purchase/Order/Item", model, "Number");
  }
  async createPurchaseBillItem() {
    const model = this.getPurchaseModel();
    return this.post("Purchase/Bill/Item", model, "Number");
  }

  async createPurchaseSupplierPayment() {
    // finder the supplier
    const type = this.any(["Bill", "Order"]);

    const orders = await this.get(`Purchase/${type}/Item?status=Open`);
    const po = this.any(orders.filter((x) => x.BalanceDueAmount > 0));
    if (!po) return;

    const model = {
      PayFrom: "Account",
      Account: this.randAccount("Bank", undefined, false),
      Supplier: po.Supplier,
      PayeeAddress: faker.address.streetAddress(),
      StatementParticulars: "",
      PaymentNumber: this.uniqueNumber(),
      Date: this.rndDate(),
      AmountPaid: po.BalanceDueAmount,
      Memo: faker.lorem.sentence(),
      Lines: [
        {
          Type: type,
          Purchase: {
            UID: po.UID,
          },
          AmountApplied: po.BalanceDueAmount,
        },
      ],
      DeliveryStatus: "Print",
      ForeignCurrency: null,
    };
    return this.post("Purchase/SupplierPayment", model, "PaymentNumber");
  }
  async createBankingRecieveMoney() {
    const allowAccounts = ["Bank", "CreditCard"];
    const recievedAccount = [
      "Income",
      "OtherIncome",
      "Expense",
      "CostOfSales",
      "OtherExpense",
    ];
    const model = {
      DepositTo: "Account",
      Account: {
        UID: this.randAccount(this.any(allowAccounts), undefined, false).UID,
      },
      Contact: this.any(this.suppliers),
      PayeeAddress: faker.address.streetAddress(),
      StatementParticulars: "",
      PaymentNumber: this.uniqueNumber(),
      Date: this.rndDate(),
      AmountPaid: this.rndAmount(),
      IsTaxInclusive: true,
      TotalTax: 9.1,
      Memo: faker.finance.transactionDescription(),
      Lines: [
        {
          Account: {
            UID: this.randAccount(this.any(recievedAccount), undefined, false)
              .UID,
          },
          Job: null,
          TaxCode: this.randTax("GST"),
          Amount: this.rndAmount(),
          Memo: faker.lorem.sentence(),
        },
      ],
      ChequePrinted: false,
      DeliveryStatus: "Print",
      // Category: {
      //   UID: "315ad93c-bf0a-4e9f-9804-8bed8dd8805f",
      // },
      ForeignCurrency: null,
    };
    return this.post("Banking/ReceiveMoneyTxn", model, "PaymentNumber");
  }
  async createBankingSpendMoney() {
    const model = {
      PayFrom: "Account",
      Account: {
        UID: this.randAccount("Bank", undefined, false).UID,
      },
      Contact: this.any(this.suppliers),
      PayeeAddress: faker.address.streetAddress(),
      StatementParticulars: "",
      PaymentNumber: this.uniqueNumber(),
      Date: this.rndDate(),
      AmountPaid: this.rndAmount(),
      IsTaxInclusive: true,
      TotalTax: 9.1,
      Memo: faker.finance.transactionDescription(),
      Lines: [
        {
          Account: {
            UID: this.randAccount("Bank", undefined, false).UID,
          },
          Job: null,
          TaxCode: this.randTax("GST"),
          Amount: this.rndAmount(),
          Memo: faker.lorem.sentence(),
        },
      ],
      ChequePrinted: false,
      DeliveryStatus: "Print",
      // Category: {
      //   UID: "315ad93c-bf0a-4e9f-9804-8bed8dd8805f",
      // },
      ForeignCurrency: null,
    };
    return this.post("Banking/SpendMoneyTxn", model, "PaymentNumber");
  }
}
