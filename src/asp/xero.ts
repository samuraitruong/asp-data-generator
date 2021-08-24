/* eslint-disable prefer-destructuring */
/* eslint-disable max-len */
/* eslint-disable class-methods-use-this */
import {
  Account,
  AccountType,
  Address,
  Contact,
  Contacts,
  CreditNote,
  CreditNotes,
  Invoice,
  Invoices,
  Item,
  Items,
  LineAmountTypes,
  ManualJournal,
  ManualJournals,
  Phone,
  PurchaseOrder,
  PurchaseOrders,
  TaxType,
  XeroClient,
} from "xero-node";
import hashObject from "object-hash";

import * as fs from "fs";

import { XERO_SCOPES } from "../constants";
import moment from "moment";
import { Asset } from "xero-node/dist/gen/model/assets/asset";
import { AssetType } from "xero-node/dist/gen/model/assets/assetType";
import { AssetStatus } from "xero-node/dist/gen/model/assets/assetStatus";

export class Xero {
  readonly client: XeroClient;

  private tenant: any;

  accounts: Account[] = [];

  items: Item[] = [];

  contacts: Contact[] = [];
  assetTypes: AssetType[] = [];

  constructor(public tokenSet: any) {
    this.client = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID || "",
      clientSecret: process.env.XERO_CLIENT_SECRET || "",
      redirectUris: [
        process.env.XERO_REDIRECT_URL ||
        "https://local.aspgenerator.com:3443/oauth/xero",
      ],
      scopes: XERO_SCOPES,
      // state: 'returnPage=my-sweet-dashboard', // custom params (optional)
      httpTimeout: 3000, // ms (optional)
    });
  }

  randAccount(type?: AccountType) {
    // console.log(this.accounts)
    const filter = this.accounts.filter((x) => !type || x.type === type);
    return this.any(filter);
  }
  public async refreshToken(orgName?: string) {
    await this.client.initialize();
    await this.client.setTokenSet(this.tokenSet);
    this.tokenSet = await this.client.refreshWithRefreshToken(
      process.env.XERO_CLIENT_ID,
      process.env.XERO_CLIENT_SECRET,
      this.tokenSet.refresh_token
    );
    fs.writeFileSync("xero.json", JSON.stringify(this.tokenSet, null, 2));
    await this.client.updateTenants(false);
    // TODO select right tenant
    this.tenant = this.client.tenants[0];
  }

  rndAmount(max = 2000) {
    // return faker.finance.amount();
    return +(Math.random() * max).toFixed(2);
  }
  async fetchAll<T1, T>(
    fetchFn: (date: Date) => Promise<{ body: T1 }>,
    value?: (item: T1) => T[]
  ) {
    let items = [];
    let updatedDateUTC = null;

    while (true) {
      const res = await fetchFn(new Date(updatedDateUTC));
      const data = value(res.body as T1);
      items = [...items, ...data];
      if (data.length === 0) return items;

      updatedDateUTC = data[0]["updatedDateUTC"];
      console.log("updatedDateUTC", updatedDateUTC, data.length);
    }
  }

  async fetchCommonEntities() {
    this.accounts = (
      await this.client.accountingApi.getAccounts(this.tenant.tenantId)
    ).body.accounts;
    this.items = (
      await this.client.accountingApi.getItems(this.tenant.tenantId)
    ).body.items as Item[];
    this.contacts = (
      await this.client.accountingApi.getContacts(this.tenant.tenantId)
    ).body.contacts as Item[];
    this.assetTypes = (
      await this.client.assetApi.getAssetTypes(this.tenant.tenantId)
    ).body as AssetType[];
  }

  any<T>(arr: T[]) {
    const index = Math.floor(Math.random() * arr.length);
    return arr[index];
  }
  docNum() {
    return Math.random().toString().slice(3);
  }

  async wrapApi(type, fn, keys = "") {
    try {
      const res = await fn();
      const props = keys.split(".");
      const valueId = props.reduce((a, b) => a[b] || {}, res.body || {});

      console.log(`Created  ${type} #id = %s`, valueId);

      return res.body;
    } catch (err) {
      try {
        if (err.response?.body) {
          fs.writeFileSync(
            "./logs/xero/" + type + ".json",
            JSON.stringify(err.response.body, null, 4)
          );
          console.log(JSON.stringify(err.response.body, null, 2));
        } else {
          // Maybe rate limit, retrying
          if (err.response.statusCode === 429) {
            //retrying
            if (err.response.headers["retry-after"]) {
              const retryAfter = err.response.headers["retry-after"];

              console.log("API rate limit hit, retrying after %s", retryAfter);
              await new Promise((r) => setTimeout(r, retryAfter * 1000));
              return this.wrapApi(type, fn, keys);
            }
            console.log("Http Status code", err.response.statusCode);

            console.log(err.response.headers);
          }
        }
      } catch (err) {
        //swallow
        console.log(err);
      }
    }
  }

  rndDate() {
    const date = Math.floor(Math.random() * 730);
    return moment().subtract(date, "days").format("YYYY-MM-DD");
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

  async createInvoice() {
    // const item = this.any(this.items);
    const acc = this.randAccount(AccountType.REVENUE);
    const contact = this.any(this.contacts);
    const lineItems: Item[] = this.ranItems(this.items, 5);
    const prefix = Math.random()
      .toString(36)
      .replace(/[^a-z]+/gi, "")
      .substr(0, 5)
      .toUpperCase();
    const invoice: Invoice = {
      date: this.rndDate(),
      dueDate: this.rndDate(),
      type: Invoice.TypeEnum.ACCREC,
      invoiceNumber: prefix + "-" + faker.datatype.number(),
      lineAmountTypes: LineAmountTypes.NoTax,
      contact,
      status: this.any([
        Invoice.StatusEnum.SUBMITTED,
        Invoice.StatusEnum.DRAFT,
        Invoice.StatusEnum.AUTHORISED,
      ]) as any,
      lineItems: lineItems.map((item) => ({
        lineAmount: item.salesDetails.unitPrice,
        lineItemID: item.itemID,
        itemCode: item.code,
        description: item.description,
        taxType: TaxType.BASEXCLUDED.toString(),
        accountID: acc.accountID,
      })),
    };
    const data = new Invoices();
    data.invoices = [invoice];

    return this.wrapApi(
      "Invoice",
      async () => {
        return await this.client.accountingApi.createInvoices(
          this.tenant.tenantId,
          data
        );
      },
      "invoices.0.invoiceID"
    );
  }

  async createManualJournal() {
    // const item = this.any(this.items);
    const acc = this.randAccount(AccountType.REVENUE);
    const expense = this.randAccount(AccountType.EXPENSE);
    const lineItems: Item[] = this.ranItems(this.items, 1);
    const journal: ManualJournal = {
      date: this.rndDate(),

      narration: faker.lorem.sentence(),
      lineAmountTypes: LineAmountTypes.NoTax,
      status: this.any([
        ManualJournal.StatusEnum.DRAFT,
        ManualJournal.StatusEnum.POSTED,
      ]) as any,
      journalLines: lineItems
        .map((item) => [
          {
            lineAmount: item.salesDetails.unitPrice || 10,
            lineItemID: item.itemID,
            itemCode: item.code,
            description: item.description || "NA",
            taxType: TaxType.BASEXCLUDED.toString(),
            accountID: acc.accountID,
          },
          {
            lineAmount: -item.salesDetails.unitPrice || 10,
            lineItemID: item.itemID,
            itemCode: item.code,
            description: item.description || "NA",
            taxType: TaxType.BASEXCLUDED.toString(),
            accountID: expense.accountID,
          },
        ])
        .flat(),
    };
    const data = new ManualJournals();
    data.manualJournals = [journal];

    return this.wrapApi(
      "ManualJournal",
      async () => {
        return await this.client.accountingApi.createManualJournals(
          this.tenant.tenantId,
          data
        );
      },
      "manualJournals.0.manualJournalID"
    );
  }

  async createItem() {
    const expenseAcc = this.randAccount(AccountType.EXPENSE);
    const revenueAcc = this.randAccount(AccountType.REVENUE);

    const type = this.any(Object.values(AccountType)) as AccountType;
    const amt = this.rndAmount(500);
    const item: Item = {
      name: faker.commerce.productName() + "# " + this.docNum(),
      code: Math.round(Math.random() * 100000).toString(),
      description: faker.commerce.productDescription(),
      purchaseDetails: {
        unitPrice: amt,
        accountCode: expenseAcc.code,
      },
      salesDetails: {
        unitPrice: amt * 1.25,
        accountCode: revenueAcc.code,
      },
      // isTrackedAsInventory: true,
      // inventoryAssetAccountCode: inventoryAcc.code
    };
    const items: Items = {
      items: [item],
    };
    return this.wrapApi(
      "Item",
      async () => {
        return await this.client.accountingApi.createItems(
          this.tenant.tenantId,
          items
        );
      },
      "items.0.itemID"
    );
  }

  async createAccount() {
    const type = this.any(Object.values(AccountType)) as AccountType;

    const acc: Account = {
      name: faker.finance.accountName() + "# " + this.docNum(),
      type,
      code: Math.round(Math.random() * 1000000).toString(),
      description: faker.commerce.productDescription(),
    };
    return this.wrapApi("account", async () => {
      return await this.client.accountingApi.createAccount(
        this.tenant.tenantId,
        acc
      );
    });
  }

  async createContact(isCustomer = false, isSupplier = false) {
    const type = this.any(Object.values(AccountType)) as AccountType;

    const firstName = faker.name.findName();
    const lastName = faker.name.lastName();

    const contact: Contact = {
      name: firstName + " " + lastName + " #" + this.docNum(),
      firstName,
      lastName,
      emailAddress: faker.internet.email(),
      phones: [
        {
          phoneType: Phone.PhoneTypeEnum.OFFICE,
          phoneNumber: faker.phone.phoneNumber(),
        },
      ],
      website: faker.internet.url(),
      skypeUserName: faker.internet.userName(),
      isCustomer,
      isSupplier,
      addresses: [
        {
          addressLine1: faker.address.streetAddress(),
          addressType: Address.AddressTypeEnum.STREET,
          addressLine2: faker.address.secondaryAddress(),
          postalCode: faker.address.zipCode(),
          city: faker.address.cityName(),
          country: faker.address.country(),
          region: faker.address.state(),
        },
      ],
    };
    const input: Contacts = {
      contacts: [contact],
    };
    return this.wrapApi(
      "account",
      async () => {
        return await this.client.accountingApi.createContacts(
          this.tenant.tenantId,
          input
        );
      },
      "contacts.0.contactID"
    );
  }

  async createCreditNote() {
    const items = this.ranItems(this.items, 5);
    const item: CreditNote = {
      type: this.any(Object.values(CreditNote.TypeEnum)) as CreditNote.TypeEnum,
      contact: this.any(this.contacts),
      date: this.rndDate(),
      status: CreditNote.StatusEnum.DRAFT,
      lineAmountTypes: LineAmountTypes.NoTax,
      lineItems: items.map((item) => ({
        accountCode: this.randAccount().code,
        unitAmount: item.salesDetails.unitPrice || 10,
        lineAmount: item.salesDetails.unitPrice || 10,
        quantity: 1,
        description: faker.finance.transactionDescription(),
      })),
    };
    const input: CreditNotes = {
      creditNotes: [item],
    };
    return this.wrapApi(
      "creditNote",
      async () => {
        return await this.client.accountingApi.createCreditNotes(
          this.tenant.tenantId,
          input
        );
      },
      "creditNotes.0.creditNoteID"
    );
  }
  uniqueNumber() {
    return (
      Math.random()
        .toString(36)
        .replace(/[^a-z]+/gi, "")
        .substr(0, 5)
        .toUpperCase() +
      "-" +
      faker.datatype.number()
    );
  }

  async createPurchaseOrder() {
    const items = this.ranItems(this.items, 5);

    const item: PurchaseOrder = {
      contact: this.any(this.contacts),
      deliveryDate: this.rndDate(),
      reference: this.uniqueNumber(),
      date: this.rndDate(),
      status: this.any([
        PurchaseOrder.StatusEnum.AUTHORISED,
        PurchaseOrder.StatusEnum.BILLED,
        PurchaseOrder.StatusEnum.DRAFT,
        PurchaseOrder.StatusEnum.SUBMITTED,
      ]) as any,
      deliveryAddress: faker.address.streetAddress(),
      purchaseOrderNumber: this.uniqueNumber(),
      lineAmountTypes: LineAmountTypes.NoTax,
      deliveryInstructions: faker.lorem.sentence(),
      telephone: faker.phone.phoneNumber(),
      lineItems: items.map((item) => ({
        accountCode: this.randAccount().code,
        itemCode: item.code,
        unitAmount: item.salesDetails.unitPrice || 10,
        lineAmount: item.salesDetails.unitPrice || 10,
        quantity: 1,
        description: faker.finance.transactionDescription(),
      })),
    };
    const input: PurchaseOrders = {
      purchaseOrders: [item],
    };
    return this.wrapApi(
      "purchaseOrder",
      async () => {
        return await this.client.accountingApi.createPurchaseOrders(
          this.tenant.tenantId,
          input
        );
      },
      "purchaseOrders.0.purchaseOrderID"
    );
  }

  async createFixedAsset() {
    const items = this.ranItems(this.items, 5);
    const date = this.rndDate();
    const item: Asset = {
      assetName: faker.commerce.productName(),
      assetTypeId: this.any(this.assetTypes).assetTypeId,
      assetNumber: this.uniqueNumber(),
      purchaseDate: date,
      assetStatus: AssetStatus.Draft,
      purchasePrice: this.rndAmount(5000),
      bookDepreciationDetail: {
        depreciationStartDate: moment().format("YYYY-MM-DD"),
      },
    };
    return this.wrapApi(
      "FixedAsset",
      async () => {
        return await this.client.assetApi.createAsset(
          this.tenant.tenantId,
          item
        );
      },
      "assetId"
    );
  }
  async createCommonEntity() {
    return [
      await this.createAccount(),
      await this.createContact(),
      await this.createItem(),
    ];
  }
  async createTestData() {
    return [
      await this.createPurchaseOrder(),
      await this.createInvoice(),
      await this.createCreditNote(),
      await this.createManualJournal(),
      await this.createFixedAsset(),
    ];
  }
}
