"""Preview and post normalised CSV statements without duplicating existing purchases."""
import csv
import io
from collections import Counter, defaultdict
from decimal import Decimal

from ledger import CATEGORIES, iso_day, label, money, option, save_entry

def prepare(con, text):
    if not isinstance(text, str) or len(text.encode("utf-8")) > 2_000_000:
        raise ValueError("Choose a UTF-8 CSV under 2 MB.")
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff"), newline=""))
    if not reader.fieldnames:
        raise ValueError("The CSV is empty.")
    headers = [h.strip().lower() for h in reader.fieldnames]
    if len(headers) != len(set(headers)):
        raise ValueError("The CSV contains duplicate column names.")
    reader.fieldnames = headers
    amount_column = "amount" if "amount" in headers else "net amount inr"
    method_column = "card" if "card" in headers else "payment method"
    required = {"date","merchant",method_column,amount_column}
    if not required.issubset(headers):
        raise ValueError("Include columns for Date, Merchant, Payment method and Amount.")
    accounts = defaultdict(list)
    for row in con.execute("SELECT id, name, last4 FROM cards"):
        accounts[row["name"].casefold()].append(row["id"])
        if row["last4"]:
            accounts[row["last4"]].append(row["id"])
    known = Counter((r["day"],r["merchant"].casefold(),r["amount"],r["card"],r["kind"])
                    for r in con.execute("SELECT day,merchant,amount,card,kind FROM entries"))
    fresh, duplicates, errors = [], 0, []
    for index, row in enumerate(reader, start=2):
        if index > 5001:
            raise ValueError("Limit each import to 5,000 rows.")
        try:
            date = iso_day(row["date"].strip())
            merchant = label(row["merchant"])
            ids = set(accounts[row[method_column].strip().casefold()])
            if len(ids) != 1:
                raise ValueError("Use a unique payment method name or card ending.")
            card = ids.pop()
            raw = row[amount_column].replace("₹","").replace(",","").strip()
            net = Decimal(raw)
            amount = money(abs(net))
            if not amount:
                raise ValueError("Use a nonzero amount.")
            kind = (row.get("type") or ("Refund" if net < 0 else "Purchase")).strip().title()
            option(kind, ["Purchase","Refund"])
            if net < 0 and kind != "Refund":
                raise ValueError("Negative spend must be a refund.")
            cat = (row.get("category") or "Other").strip().casefold()
            category = next((name for name in CATEGORIES if name.casefold()==cat), None)
            if not category:
                raise ValueError("Unknown category.")
            key = (date,merchant.casefold(),amount,card,kind)
            if known[key]:
                known[key]-=1
                duplicates+=1
                continue
            fresh.append(dict(day=date,merchant=merchant,amount=str(Decimal(amount)/100),card=card,kind=kind,category=category))
        except (ValueError,ArithmeticError,AttributeError,TypeError) as exc:
            errors.append({"row":index,"error":str(exc) if isinstance(exc,ValueError) else "Invalid or missing value."})
    if not fresh and not duplicates and not errors:
        raise ValueError("The file contains no transaction rows.")
    return fresh,duplicates,errors

def statement(con, text, post):
    rows, duplicates, errors = prepare(con,text)
    if post:
        if errors:
            raise ValueError("Correct the flagged rows before importing.")
        for row in rows:
            save_entry(con,row,source="CSV")
    return {"added":len(rows),"duplicates":duplicates,"errors":errors[:12],"errorCount":len(errors),"sample":rows[:5]}
