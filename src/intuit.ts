import faker from "faker";
import moment from "moment";
import { INTUIT_ACCOUNT_ENUMS } from './constats';
import asyncPool from "tiny-async-pool";
export class Intuit {
  readonly apiUrl;
  _customers: any[] = [];
  _accounts: any[] = [];
  _accountList: any[] = [];
  _items: any[] = []
  _vendors: any[] = []
  constructor(private client) {
    this.apiUrl = 'https://quickbooks.api.intuit.com/v3/company/' + client.getToken().realmId;

  }
  async fetchCommonEntities() {
    this._customers = await this.customers();
    this._accounts = await this.accounts();
    this._accountList = await this.accountList();
    this._items = await this.items();
    this._vendors = await this.vendors();
  }
  private async createAllAccount() {
    const allAccounts = Object.entries(INTUIT_ACCOUNT_ENUMS).map(([key, values]) => values.map(v => [key, v])).flat();

    asyncPool(10, allAccounts, async ([type, subtype]) => {
      await this.createAccount(type, subtype);
      console.log("Created account %s %s", type, subtype)
    })
  }
  private async post(url, model) {
    try {
      const postRes = await this.client.makeApiCall({
        url: this.apiUrl + url + "?minorversion=59",
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(model),
      });
      const output: any = Object.values(postRes.json)[0]
      console.info('Created successful %s #id=%s  name = %s', url, output.Id, output?.Name || output?.DisplayName)
      return postRes.json;
    }
    catch (err) {
      console.log(url, model)
      console.log(url, err.authResponse.json.Fault)
    }
  }

  async createJournalEntry() {
    const date = Math.floor(Math.random() * 1000)
    const account = this.any(this._accounts);
    const model = {

      "Line": [
        {
          "JournalEntryLineDetail": {
            "PostingType": "Debit",
            "AccountRef": {
              "name": "Payroll clearing",
              "value": "33"
            }
          },
          "DetailType": "JournalEntryLineDetail",
          "Amount": 100.0,
          "Id": "0",
          "Description": "nov portion of rider insurance"
        },
        {
          "JournalEntryLineDetail": {
            "PostingType": "Credit",
            "AccountRef": {
              "name": "MyJobs_test",
              "value": "44"
            }
          },
          "DetailType": "JournalEntryLineDetail",
          "Amount": 100.0,
          "Description": "nov portion of rider insurance"
        }
      ]
    }
    return this.post("/journalentry", model);
  }

  async createCustomer() {
    const firstName = faker.name.firstName()
    const lastname = faker.name.lastName();


    const model = {
      "FullyQualifiedName": firstName + " " + lastname,
      "PrimaryEmailAddr": {
        "Address": faker.internet.email()
      },
      "DisplayName": firstName + " " + lastname,
      "Suffix": "",
      "Title": "Mr",
      "MiddleName": "",
      "Notes": "Here are other details.",
      "FamilyName": lastname,
      "PrimaryPhone": {
        "FreeFormNumber": faker.phone.phoneNumber()
      },
      "CompanyName": faker.company.companyName(),
      "BillAddr": {
        "CountrySubDivisionCode": "AU",
        "City": "Melbourne",
        "PostalCode": "3000",
        "Line1": faker.address.streetAddress(),
        "Country": faker.address.countryCode()
      },
      "GivenName": firstName
    }
    return this.post("/customer", model)
  }
  any(items: any[]) {
    const index = Math.floor(Math.random() * items.length);
    return items[index]
  }
  rndAccount(type) {
    const subList = this._accounts.filter(x => x.AccountType === type || x.AccountSubType === type || x.Name.includes(type));
    return this.any(subList)
  }
  async createPurchase() {
    const accountMapping = {
      CreditCard: "CreditCard",
      "Cash": "Bank",
      "Check": "Bank"
    }
    const type = this.any(Object.keys(accountMapping))
    const acc = this.rndAccount(accountMapping[type])
    const cus = this.any(this._customers);

    const expenseAccounts = new Array(Math.ceil(Math.random() * 10)).fill(1).map(x => this.any(this._accounts));

    const model = {
      TxnDate: this.rndDate(),
      TxnNum: new Date().getTime(),
      "PaymentType": type,
      "EntityRef": {
        name: cus.Name,
        value: cus.Id
      },
      "AccountRef": {
        "name": acc.Name,
        "value": acc.Id
      },
      "Memo": "test",
      "Line": expenseAccounts.map(expenseAccount => (
        {
          "DetailType": "AccountBasedExpenseLineDetail",
          "Amount": this.rndAmount(300),
          "AccountBasedExpenseLineDetail": {
            "AccountRef": {
              "name": expenseAccount.Name,
              "value": expenseAccount.Id
            }
          }
        }
      ))
    }
    return this.post("/purchase", model)
  }

  rndDate() {
    const date = Math.floor(Math.random() * 730);
    return moment().subtract(date, 'days').format("YYYY-MM-DD");
  }
  rndAmount(max: number = 2000) {
    return +(Math.random() * max).toFixed(2)
  }

  async makePayment() {
    const customer = this.any(this._customers);
    const model = {
      TxnDate: this.rndDate(),
      "TotalAmt": this.rndAmount(),
      "CustomerRef": {
        "value": customer.Id
      }
    };
    return this.post("/payment", model)
  }

  async createItem(type = "Service") {
    const inventoryAccount = this.rndAccount("Inventory Asset");
    const incomeAcc = this.rndAccount("Income");
    let cogs = this.rndAccount("SuppliesMaterialsCogs");
    if (!cogs) {
      cogs = await this.createAccount("Cost of Goods Sold", "SuppliesMaterialsCogs")
    }
    const price = this.rndAmount(100);
    const model = {
      "TrackQtyOnHand": type === 'Inventory',
      "Name": faker.commerce.productName(),
      "QtyOnHand": 10,
      "UnitPrice": price,
      "PurchaseCost": price * 0.75,
      "IncomeAccountRef": {
        "name": incomeAcc.Name,
        "value": incomeAcc.Id
      },
      "AssetAccountRef": {
        "name": inventoryAccount.Name,
        "value": inventoryAccount.Id
      },
      "InvStartDate": "2015-01-01",
      "Type": type,
      "ExpenseAccountRef": {
        "name": cogs.Name,
        "value": cogs.Id
      }
    }
    return this.post("/item", model)
  }

  async createInvoice() {
    const customer = this.any(this._customers);
    const date = Math.floor(Math.random() * 600)
    const model = {
      TxnDate: moment().subtract(date, 'days').format("YYYY-MM-DD"),
      "Line": [
        {
          "DetailType": "SalesItemLineDetail",
          "Amount": Math.random() * 2500,
          "SalesItemLineDetail": {
            "TaxCodeRef": {
              "value": "5"
            },
            "ItemRef": {
              "name": "Service",
              "value": "3"
            }
          }
        }
      ],
      "CustomerRef": {
        "value": customer.Id
      }
    };
    return this.post("/invoice", model)
  }

  async createAccount(AccountType, AccountSubType) {
    const AcctNum = new Date().getTime().toString()
    const model = {
      AcctNum,
      "Name": AccountType + "_ " + AccountSubType || '' + "_#" + AcctNum,
      "AccountType": AccountType,
      AccountSubType,
      CurrentBalance: 123
    }
    return this.post("/account", model)
  }

  async createVendor() {
    const companyName = faker.company.companyName()
    const model = {
      "PrimaryEmailAddr": {
        "Address": faker.internet.email()
      },
      "WebAddr": {
        "URI": faker.internet.url()
      },
      "PrimaryPhone": {
        "FreeFormNumber": faker.phone.phoneNumber()
      },
      "DisplayName": companyName,
      "Suffix": faker.name.suffix(),
      "Title": faker.name.prefix(),
      "Mobile": {
        "FreeFormNumber": faker.phone.phoneNumber()
      },
      "FamilyName": faker.name.lastName(),
      "TaxIdentifier": faker.finance.routingNumber(),
      "AcctNum": faker.finance.account(),
      "CompanyName": companyName,
      "BillAddr": {
        "City": faker.address.cityName(),
        "Country": faker.address.country(),
        "Line3": faker.address.streetAddress(),
        "Line2": faker.address.secondaryAddress(),
        "Line1": companyName,
        "PostalCode": faker.address.zipCode(),
        "CountrySubDivisionCode": faker.address.countryCode()
      },
      "GivenName": faker.name.firstName(),
      "PrintOnCheckName": faker.company.companyName()
    }

    return this.post("/vendor", model)
  }
  async items() {
    const res = await this.client.makeApiCall({
      url: this.apiUrl + "/query?query=select * from Item&minorversion=59"
    })
    return res.json.QueryResponse.Item
  }

  async vendors() {

    const res = await this.client.makeApiCall({
      url: this.apiUrl + "/query?query=select * from Vendor&minorversion=59"
    })
    return res.json.QueryResponse.Vendor

  }


  async accounts() {

    const res = await this.client.makeApiCall({
      url: this.apiUrl + "/query?query=select * from Account&minorversion=59"
    })
    return res.json.QueryResponse.Account

  }

  parseReport(report) {
    const headers = report.Columns.Column.map(x => x.ColTitle)
    return report.Rows.Row.map(({ ColData }) => {
      const item: any = {};
      ColData.forEach(({ value }, index) => {
        item[headers[index]] = value
      })
      return item;
    });
  }
  async accountList() {
    const res = await this.client.makeApiCall({
      url: this.apiUrl + "/reports/AccountList?minorversion=59"
    })

    return this.parseReport(res.json)
  }

  async customers() {
    const res = await this.client.makeApiCall({
      url: this.apiUrl + "/query?query=select * from Customer&minorversion=59"
    })

    return res.json.QueryResponse.Customer
  }
  ranItems(arr, maxItems) {
    var count = Math.ceil(Math.random() * maxItems);
    return Array(count).fill(0).map(x => this.any(arr))
  }
  async createSaleReciept() {
    const items = this.ranItems(this._items, 5);
    const cus = this.any(this._customers);

    const model = {
      DocNumber: new Date().getTime(),
      TxnDate: this.rndDate(),
      "CustomerRef": {
        "name": cus.Name,
        "value": cus.Id
      },
      "Line": items.map((item, index) => (
        {
          "Description": item.Name + " sale reciept #" + new Date().getTime(),
          "DetailType": "SalesItemLineDetail",

          "SalesItemLineDetail": {
            "TaxCodeRef": {
              "value": "5"
            },
            "Qty": 1,
            "UnitPrice": item.UnitPrice || 10,
            "ItemRef": {
              "name": item.Name,
              "value": item.Id
            }
          },
          "LineNum": index + 1,
          "Amount": item.UnitPrice || 10,
          "Id": "1"
        }
      ))
    };
    return this.post("/salesreceipt", model)

  }

  async createPurcharseOrder() {
    const items = this.ranItems(this._items, 5);
    const cus = this.any(this._customers);
    const vendor = this.any(this._vendors);
    let apAcc = this.rndAccount('Accounts Payable')
    if (!apAcc) {
      apAcc = await this.createAccount("Accounts Payable", undefined)
    }
    let total = 0;
    const model = {
      DocNumber: new Date().getTime(),
      TxnDate: this.rndDate(),
      "TotalAmt": 25.0,
      "Line": items.map((item, index) => {
        total += item.UnitPrice || 25;

        return {
          "DetailType": "ItemBasedExpenseLineDetail",
          "Amount": item.UnitPrice || 25,
          "Id": `${index + 1}`,
          "ItemBasedExpenseLineDetail": {
            "ItemRef": {
              "name": item.Name,
              "value": item.Id
            },
            "CustomerRef": {
              "name": cus.Name,
              "value": cus.id
            },
            "Qty": 1,
            "TaxCodeRef": {
              "value": "NON"
            },
            "BillableStatus": "NotBillable",
            "UnitPrice": item.UnitPrice || 25
          }
        }
      })
      ,
      "APAccountRef": {
        "name": apAcc.Name,
        "value": apAcc.Id
      },
      "VendorRef": {
        "name": vendor.DisplayName,
        "value": vendor.Id
      },
      "ShipTo": {
        "name": cus.Name,
        "value": cus.id

      }
    };
    model.TotalAmt = total;

    return this.post("/purchaseorder", model)

  }


}
