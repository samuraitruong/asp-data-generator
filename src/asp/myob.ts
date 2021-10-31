import qs from "qs";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import faker from "faker";
import { Base } from "./base";

export class Myob extends Base {
  clientId = process.env.MYOB_CLIENT_ID;
  clientSeret = process.env.MYOB_CLIENT_SECRET;
  companyFileUrl = "https://api.myob.com";
  tokenSet: any = {};
  items = [];
  customers = [];
  suppliers = [];
  taxCodes = [];
  accounts = [];
  jobs = [];
  uid = [];
  accountMap: any = {};
  openInvoices = [];
  constructor(startDate: string, endDate: string) {
    super(startDate, endDate, "iso");
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
    const filtering = this.accounts
      .filter(
        (x: any) =>
          type === undefined || x.Type === type || x.Classification === type
      )
      .filter((x: any) => x.Level === 2)
      .filter((x: any) => x.IsHeader === header);
    const unuseAccount = filtering.filter((x: any) => !this.accountMap[x.UID]);

    const zeroBalance = unuseAccount.filter((x) => x.CurrenBalance === 0);
    const a =
      this.any(zeroBalance) || this.any(unuseAccount) || this.any(filtering);
    if (!a) {
      console.log("No Account found", {
        type,
        level,
        header,
        totalAcc: Object.keys(this.accountMap).length,
      });
    }
    this.accountMap[a.UID] = a;
    return a;
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

  async getCompanyFiles(orgName?: string) {
    const res = await axios.get(
      `https://api.myob.com/accountright/`,
      this.defaultHeaders()
    );
    this.companyFileUrl = res.data[0].Uri;
    if (orgName) {
      this.companyFileUrl = res.data.find((x) => x.Name == orgName)?.Uri;
    }
    fs.writeJSONSync("myob_companyfiles.json", res.data);
    if (!this.companyFileUrl) {
      throw new Error("Cant not find org name: " + orgName);
    }
    return res.data;
  }

  async get(url, skip = 0) {
    let allData: any[] = [];
    const urlWithQuery =
      url +
      (url.includes("?")
        ? "&$top=1000&$skip=" + skip
        : "?$top=1000&$skip=" + skip);
    const res = await axios.get(
      `${this.companyFileUrl}/${urlWithQuery}`,
      this.defaultHeaders()
    );
    console.log("Fetch %s -> %d", url, res.data.Items.length);
    const data = res.data.Items || res.data;
    allData = [...allData, ...data];
    if (data.length === 1000) {
      const nextPageData = await this.get(url, skip + 1000);
      allData = [...allData, ...nextPageData];
    }
    if (skip === 0) {
      console.log("TOTAL %s -> %d", url, allData.length);
      const entity = url.split("?")[0];
      const filePath = "./data/myob/" + entity + ".json";
      fs.mkdirsSync(path.dirname(filePath));
      fs.writeJSONSync(filePath, allData, { spaces: 4 });
    }
    return allData;
  }

  async fetchCommonEntities() {
    this.taxCodes = await this.get("GeneralLedger/TaxCode");
    this.accounts = await this.get("GeneralLedger/Account");
    this.jobs = await this.get("GeneralLedger/Job");
    this.customers = await this.get("Contact/Customer");
    this.items = await this.get("Inventory/Item");
    this.suppliers = await this.get("Contact/Supplier");

    // console.log(this.randAccount("AccountsPayable", undefined, false));
    // throw new Error("ss");
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
        UID: this.randAccount(
          this.any(["OtherIncome", "Income", "Asset"]),
          undefined,
          false
        ).UID,
      },
      ExpenseAccount: {
        UID: this.randAccount(
          this.any(["OtherExpense", "Expense"]),
          undefined,
          false
        ).UID,
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
        ExpenseAccount: this.randAccount(
          this.any([
            "Expense",
            "OtherExpense",
            "Asset",
            "Liability",
            "Income",
            "OtherIncome",
          ]),
          undefined,
          false
        ),
      },
    };
    return this.post("Contact/Supplier", model, "DisplayID");
  }

  async createPersonal() {
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
    };
    return this.post("Contact/Personal", model, "DisplayID");
  }

  async createJob() {
    const model = {
      Number: this.uniqueNumber(),
      Name: faker.commerce.productName(),
      Description: faker.lorem.sentence(),
    };
    return this.post("GeneralLedger/Job", model, "Number");
  }

  async createGeneralJournal() {
    const amount = this.rndAmount();
    // const job = { UID: this.any(this.jobs).UID };
    const model = {
      DisplayID: this.uniqueNumber(),
      DateOccurred: this.transactionDate(),
      Memo: faker.finance.transactionDescription(),
      Lines: [
        {
          Account: {
            UID: this.randAccount("Liability", undefined, false).UID,
          },
          // Job: job,
          Memo: faker.lorem.sentence(),
          TaxCode: this.randTax("GST_VAT"),
          Amount: amount,
          IsCredit: false,
          TaxAmount: 0,
          IsOverriddenTaxAmount: false,
        },
        {
          Account: {
            UID: this.randAccount("Asset", undefined, false).UID,
          },
          //  Job: job,
          Memo: faker.lorem.sentence(),
          TaxCode: this.randTax("GST_VAT"),
          Amount: amount,
          IsCredit: true,
          TaxAmount: 0,
          IsOverriddenTaxAmount: false,
        },
      ],
    };
    return this.post("GeneralLedger/GeneralJournal", model, "DisplayID");
  }

  async createAccount() {
    if (!this.accounts || this.accounts.length === 0) {
      this.accounts = await this.get("GeneralLedger/Account");
    }

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

    const ParentAccount = this.randAccount(Type, this.any([2, 3]), true);
    if (!ParentAccount) {
      return await this.createAccount();
    }

    const model = {
      Name:
        Type +
        " - " +
        faker.finance.accountName() +
        " - " +
        faker.datatype.string(),
      DisplayID: this.uniqueNumber(),
      Classification,
      Type,
      //Number: 9901,
      Description: faker.lorem.sentence(),
      IsActive: true,
      IsHeader,
      TaxCode: this.anyUID(this.taxCodes),
      ParentAccount,
      // OpeningBalance: 10000,
    };
    // console.log(model);
    return this.post("GeneralLedger/Account", model, "DisplayID");
  }

  async createSaleCustomerPayment() {
    // need to query the customer invoice and place the payment.
    if (this.openInvoices.length === 0) {
      this.openInvoices = await this.get(
        "Sale/Invoice?$filter=Status eq 'Open'"
      );
    }
    const invoice = this.any(
      this.openInvoices.filter((x) => x.BalanceDueAmount > 0)
    );
    if (!invoice) return;
    this.openInvoices = this.openInvoices.filter((x) => x.UID !== invoice.UID);

    const model = {
      PayFrom: "Account",
      Account: { UID: this.randAccount("Bank", undefined, false).UID },
      Customer: invoice.Customer,
      PayeeAddress: faker.address.streetAddress(),
      StatementParticulars: "",
      PaymentNumber: this.uniqueNumber(),
      Date: this.transactionDate(),
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
      "Asset",
      "Equity",
      "OtherExpense",
    ]);
    const model = {
      Number: this.uniqueNumber(),
      Date: this.transactionDate(),
      SupplierInvoiceNumber: null,
      Customer: this.anyUID(this.customers),
      ShipToAddress: faker.address.streetAddress(),
      Terms: {
        PaymentIsDue: "DayOfMonthAfterEOM",
        DiscountDate: 1,
        BalanceDueDate: 30,
        DiscountForEarlyPayment: 0,
        MonthlyChargeForLatePayment: 0,
        DiscountExpiryDate: this.transactionDate(),
        Discount: 0,
        DueDate: this.transactionDate(),
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
      "OtherExpense",
      "Expense",
    ]);
    const model = {
      Number: this.uniqueNumber(),
      Date: this.transactionDate(),
      SupplierInvoiceNumber: null,
      Customer: this.anyUID(this.customers),
      ShipToAddress: faker.address.streetAddress(),
      Terms: {
        PaymentIsDue: "DayOfMonthAfterEOM",
        DiscountDate: 1,
        BalanceDueDate: 30,
        DiscountForEarlyPayment: 0,
        MonthlyChargeForLatePayment: 0,
        DiscountExpiryDate: this.transactionDate(),
        Discount: 0,
        DueDate: this.transactionDate(),
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
      Date: this.transactionDate(),
      SupplierInvoiceNumber: this.uniqueNumber(),
      Supplier: this.any(this.suppliers),
      ShipToAddress: faker.address.streetAddress(),
      Terms: {
        PaymentIsDue: "DayOfMonthAfterEOM",
        DiscountDate: 1,
        BalanceDueDate: 30,
        DiscountForEarlyPayment: 0,
        MonthlyChargeForLatePayment: 0,
        DiscountExpiryDate: this.transactionDate(),
        Discount: 0,
        DueDate: this.transactionDate(),
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
      PromisedDate: this.transactionDate(),
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
  async createPurchaseBillService() {
    const model = this.getPurchaseModel();
    return this.post("Purchase/Bill/Service", model, "Number");
  }
  openOrders = {
    Bill: [],
    Order: [],
  };
  async createPurchaseSupplierPayment() {
    // finder the supplier
    const type = this.any(["Bill", "Order"]);
    if (this.openOrders[type].length === 0) {
      this.openOrders[type] = await this.get(
        `Purchase/${type}/Item?$filter=Status eq 'Open'`
      );
      console.log("Total open ", type, this.openOrders[type].length);
    }

    const po = this.any(
      this.openOrders[type].filter(
        (x) => x.BalanceDueAmount > 0 && !this.uid.includes(x.UID)
      )
    );
    if (!po) return;
    this.uid.push(po.UID);

    const model = {
      PayFrom: "Account",
      Account: this.randAccount("Bank", undefined, false),
      Supplier: po.Supplier,
      PayeeAddress: faker.address.streetAddress(),
      StatementParticulars: "",
      PaymentNumber: this.uniqueNumber(),
      Date: this.transactionDate(),
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
      Date: this.transactionDate(),
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
      Date: this.transactionDate(),
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

  async createCommonEntity() {
    return [
      await this.createAccount(),
      await this.createCustomer(),
      await this.createSupplier(),
      await this.createPersonal(),
      await this.createInventoryItem(),
    ];
  }

  async createFinancialData() {
    return [
      await this.createSaleInvoiceItem(),
      await this.createGeneralJournal(),
      await this.createPurchaseOrderItem(),
      await this.createPurchaseBillItem(),
    ];
  }

  async createPayment() {
    return [
      await this.createSaleCustomerPayment(),
      await this.createPurchaseSupplierPayment(),
    ];
  }

  async createTestData() {
    return [
      await this.createSaleInvoiceItem(),
      await this.createGeneralJournal(),
      await this.createSaleCustomerPayment(),
      await this.createPurchaseOrderItem(),
      await this.createPurchaseSupplierPayment(),
      await this.createPurchaseBillItem(),
      // await this.createBankingSpendMoney(),
      // await this.createBankingRecieveMoney(),
    ];
  }
}
