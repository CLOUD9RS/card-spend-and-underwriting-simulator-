"""Local SQLite ledger. Amounts and point valuations are stored in paise."""
import calendar
import fcntl
import threading
import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
CATEGORIES = ["Shopping", "Dining", "Groceries", "Travel", "Transport", "Bills", "Education", "Fuel", "Rent", "Wallet", "Government", "EMI", "Education platform", "Other"]
EXCLUDED = {"Fuel", "Rent", "Wallet", "Government", "EMI", "Education platform"}
BANKS = ["HDFC Bank", "Kotak Mahindra Bank", "Other"]
ROOT = Path(os.environ.get("CARDFOLIO_DATA", Path.home() / "Library" / "Application Support" / "Cardfolio"))
SCHEMA = """
CREATE TABLE IF NOT EXISTS cards(id INTEGER PRIMARY KEY, name TEXT NOT NULL, bank TEXT NOT NULL, last4 TEXT NOT NULL, network TEXT NOT NULL, program TEXT NOT NULL, step INTEGER NOT NULL, rate INTEGER NOT NULL, valuation INTEGER NOT NULL, cycle INTEGER NOT NULL, target INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS card_match ON cards(bank,last4) WHERE last4 != '';
CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY, merchant TEXT NOT NULL, amount INTEGER NOT NULL, day TEXT NOT NULL, card INTEGER NOT NULL REFERENCES cards(id), category TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, override INTEGER, cashback INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sources(name TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, checked REAL NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', imported INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS alerts(uid TEXT PRIMARY KEY, channel TEXT, bank TEXT, last4 TEXT, merchant TEXT, amount INTEGER, day TEXT, kind TEXT, stamp REAL, reference TEXT, status TEXT, entry INTEGER);
CREATE TABLE IF NOT EXISTS budgets(month TEXT, category TEXT, amount INTEGER NOT NULL, PRIMARY KEY(month,category));
CREATE TABLE IF NOT EXISTS recurring(id INTEGER PRIMARY KEY, merchant TEXT NOT NULL, amount INTEGER NOT NULL, card INTEGER NOT NULL REFERENCES cards(id), category TEXT NOT NULL, due TEXT NOT NULL, anchor INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
"""

def today():
    return datetime.now(IST).date()

def month_shift(day, delta):
    n = day.year * 12 + day.month - 1 + delta
    return date(n // 12, n % 12 + 1, 1)

def money(value, limit=100_000_000_00):
    try:
        raw = Decimal(str(value))
        if not raw.is_finite() or raw < 0 or raw > Decimal(limit) / 100:
            raise ValueError
        return int((raw * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    except (ValueError, InvalidOperation, OverflowError):
        raise ValueError("Enter a valid amount in rupees.") from None

def integer(value, low, high, label):
    if not re.fullmatch(r'\d+', str(value)) or not low <= int(value) <= high:
        raise ValueError(f"{label} must be between {low} and {high}.")
    return int(value)

def label(value, size=70):
    s = " ".join(str(value or "").split())
    if not 1 <= len(s) <= size or re.search(r'(?:\d[ -]?){13,19}', s):
        raise ValueError("Use a short name without a card or account number.")
    return s

def option(value, choices):
    if value not in choices:
        raise ValueError("Choose an option from the list.")
    return value

def iso_day(value):
    try:
        dt = date.fromisoformat(str(value))
        if dt > today() or dt.year < 2000: raise ValueError
        return dt.isoformat()
    except ValueError:
        raise ValueError("Enter a date between 2000 and today.") from None

def connect(mode):
    option(mode, ["live", "demo"])
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    con = sqlite3.connect(ROOT / (mode + ".sqlite3"), timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con

_guards=threading.local()

@contextmanager
def guard(mode,exclusive=False):
    option(mode,["live","demo"])
    held=getattr(_guards,"held",{})
    if mode in held:
        if exclusive and not held[mode]: raise RuntimeError("Cannot upgrade a ledger lock.")
        yield
        return
    ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (ROOT/(mode+".lock")).open("a+b") as handle:
        fcntl.flock(handle,fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        _guards.held=held
        held[mode]=exclusive
        try: yield
        finally:
            del held[mode]
            fcntl.flock(handle,fcntl.LOCK_UN)

@contextmanager
def db(mode):
    with guard(mode):
        con=connect(mode)
        try:
            with con: yield con
        finally: con.close()

def initialize():
    os.umask(0o077)
    for mode in ["live","demo"]:
        with db(mode) as c:
            c.execute("PRAGMA journal_mode=WAL")
            import wealth
            c.executescript(SCHEMA + wealth.SCHEMA)
            c.execute("BEGIN IMMEDIATE")
            c.executemany("INSERT OR IGNORE INTO cards VALUES(?,?,'Other','','Other','custom',10000,0,0,1,0)",[(-1,"Cash"),(-2,"Bank UPI"),(-3,"Debit card")])
            if mode=="demo" and not c.execute("SELECT 1 FROM meta WHERE k='wealth-seeded'").fetchone():
                wealth.seed(c)
                c.execute("INSERT INTO meta VALUES('wealth-seeded','1')")
            if c.execute("SELECT 1 FROM meta WHERE k='initialized'").fetchone(): continue
            demo = mode == "demo"
            c.executemany("INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?)", [
                (1,"Regalia Gold",BANKS[0],"4821" if demo else "","Visa","regalia",20000,5,50,23,15000000),
                (2,"Dream Different",BANKS[1],"9274" if demo else "","RuPay","dream",10000,0,0,6,0)])
            c.executemany("INSERT INTO sources(name) VALUES(?)", [("Mail",),("SMS",)])
            if demo: seed(c)
            c.execute("INSERT INTO meta VALUES('initialized','1')")

def seed(c):
    anchor = today()
    shops = [("Amazon","Shopping",4999),("IndiGo","Travel",7920),("Swiggy","Dining",648),("BigBasket","Groceries",1624),("Westside","Shopping",2899),("Uber","Transport",426),("Air India","Travel",6270),("Zomato","Dining",755),("DMart","Groceries",2475),("Croma","Shopping",3790),("Airtel","Bills",999),("Blue Tokai","Dining",460)]
    month = anchor.isoformat()[:7]
    c.executemany("INSERT INTO budgets VALUES(?,?,?)",[(month,"Dining",600000),(month,"Shopping",2200000),(month,"Groceries",1000000)])
    c.execute("INSERT INTO recurring(merchant,amount,card,category,due,anchor) VALUES('Mobile plan',69900,-2,'Bills',?,28)",(anchor.replace(day=28).isoformat(),))
    c.execute("INSERT INTO entries(merchant,amount,day,card,category,kind,source) VALUES('Local market',88000,?,-1,'Groceries','Purchase','Manual')",(anchor.isoformat(),))
    for i in range(8):
        start = month_shift(anchor,-i)
        end = min(calendar.monthrange(start.year,start.month)[1], (anchor-start).days+1)
        count = [24,25,20,24,17,18,20,19][i]
        for j in range(count):
            name, cat, base = shops[(j*5+i)%len(shops)]
            day = start + timedelta(days=(j*(end-1))//(count-1))
            amount = (base + ((j*13+i*37)%120)) * (100+i*2)
            c.execute("INSERT INTO entries(merchant,amount,day,card,category,kind,source) VALUES(?,?,?,?,?,'Purchase',?)",
                      (name,amount,day.isoformat(),2 if (j+1)%4==0 else 1,cat,["SMS","Mail","Manual"][j%3]))

def save_card(c, data):
    last = str(data.get("last4","")).strip()
    if last and not re.fullmatch("[0-9]{4}",last): raise ValueError("Enter only the last four digits.")
    step = money(data.get("step",200))
    if step < 100: raise ValueError("The earning block must be at least ₹1.")
    fields = (label(data.get("name")),option(data.get("bank"),BANKS),last,option(data.get("network"),["Visa","RuPay","Mastercard","Diners Club","Amex","Other"]),
              option(data.get("program"),["regalia","dream","custom"]),step,integer(data.get("rate",0),0,1000,"Points"),money(data.get("valuation",0),100000),
              integer(data.get("cycle",1),1,31,"Statement day"),money(data.get("target",0)))
    try:
        if data.get("id"):
            integer(data["id"],1,10000000,"Card ID")
            if not c.execute("UPDATE cards SET name=?,bank=?,last4=?,network=?,program=?,step=?,rate=?,valuation=?,cycle=?,target=? WHERE id=?",fields+(data["id"],)).rowcount: raise ValueError("Card no longer exists.")
        else: c.execute("INSERT INTO cards(name,bank,last4,network,program,step,rate,valuation,cycle,target) VALUES(?,?,?,?,?,?,?,?,?,?)",fields)
    except sqlite3.IntegrityError: raise ValueError("A card with this bank and ending is already in your wallet.") from None

def save_entry(c, data, source="Manual"):
    card = c.execute("SELECT id FROM cards WHERE id=?", (data.get("card"),)).fetchone()
    if not card: raise ValueError("Select a card from your wallet.")
    amount = money(data.get("amount"))
    if amount == 0: raise ValueError("The amount must be greater than zero.")
    override = data.get("override")
    if override in ("",None): override = None
    else: override = integer(override,0,1000000,"Statement points")
    fields = (label(data.get("merchant")),amount,iso_day(data.get("day")),card[0],option(data.get("category"),CATEGORIES),option(data.get("kind"),["Purchase","Refund"]),override,money(data.get("cashback",0)))
    if data.get("id"):
        if not c.execute("UPDATE entries SET merchant=?,amount=?,day=?,card=?,category=?,kind=?,override=?,cashback=? WHERE id=?", fields+(data["id"],)).rowcount: raise ValueError("Transaction no longer exists.")
        return data["id"]
    return c.execute("INSERT INTO entries(merchant,amount,day,card,category,kind,override,cashback,source) VALUES(?,?,?,?,?,?,?,?,?)",fields+(source,)).lastrowid

def statement_end(day, closing):
    d = date.fromisoformat(day)
    e = d.replace(day=min(closing, calendar.monthrange(d.year,d.month)[1]))
    if d <= e: return e
    n = month_shift(d,1)
    return n.replace(day=min(closing,calendar.monthrange(n.year,n.month)[1]))

def state(c, mode):
    cards = [dict(r) for r in c.execute("SELECT * FROM cards ORDER BY id")]
    by_id = {r["id"]:r for r in cards}
    entries = [dict(r) for r in c.execute("SELECT * FROM entries ORDER BY day,id")]
    accrued = {}
    for row in entries:
        card = by_id[row["card"]]
        step, rate = card["step"], card["rate"]
        regalia = card["program"]=="regalia"
        if regalia and row["day"] < "2026-05-15": step, rate = 15000,4
        pts = row["amount"] // step * rate
        if card["program"]=="dream" or (regalia and row["category"] in EXCLUDED): pts=0
        if row["override"] is not None: pts = row["override"]
        sign = -1 if row["kind"]=="Refund" else 1
        pts *= sign
        key = (card["id"],statement_end(row["day"],card["cycle"]))
        if regalia and row["override"] is None and pts>0: pts=min(pts,max(0,50000-accrued.get(key,0)))
        accrued[key]=max(0,accrued.get(key,0)+pts)
        row.update(points=pts,value=pts*card["valuation"]+sign*row["cashback"],net=sign*row["amount"])
    pending = [dict(r) for r in c.execute("SELECT uid,channel,bank,last4,merchant,amount,day,kind FROM alerts WHERE status='review' ORDER BY day DESC, rowid DESC")]
    stored=c.execute("SELECT v FROM meta WHERE k='profile'").fetchone()
    profile=json.loads(stored[0]) if stored else ({"score":765,"util":24,"enquiries":2,"late":0,"ageMonths":19,"limit":300000,"spend":255000} if mode=="demo" else {})
    return dict(profile=profile,mode=mode, today=today().isoformat(), cards=[x for x in cards if x["id"]>0], accounts=[x for x in cards if x["id"]<0], budgets=[dict(x) for x in c.execute("SELECT * FROM budgets ORDER BY category")], recurring=[dict(x) for x in c.execute("SELECT * FROM recurring ORDER BY due,id")], entries=list(reversed(entries)), categories=CATEGORIES, sources=[dict(r) for r in c.execute("SELECT * FROM sources ORDER BY name")], review=pending)

def save_budget(c,data):
    month=str(data.get("month",""))
    if not re.fullmatch(r"20\d\d-(?:0[1-9]|1[0-2])",month): raise ValueError("Choose a valid budget month.")
    cat=option(data.get("category"),CATEGORIES)
    amount=money(data.get("amount"))
    if amount: c.execute("INSERT OR REPLACE INTO budgets VALUES(?,?,?)",(month,cat,amount))
    else: c.execute("DELETE FROM budgets WHERE month=? AND category=?",(month,cat))

def recurring_action(c,action,data):
    if action=="recurring":
        try: due=date.fromisoformat(str(data.get("due")))
        except ValueError: raise ValueError("Choose a valid due date.") from None
        amt=money(data.get("amount"))
        if not amt or not 2000<=due.year<=2100: raise ValueError("Check the bill amount and due date.")
        if not c.execute("SELECT 1 FROM cards WHERE id=?",(data.get("card"),)).fetchone(): raise ValueError("Select a payment method.")
        c.execute("INSERT INTO recurring(merchant,amount,card,category,due,anchor) VALUES(?,?,?,?,?,?)",(label(data.get("merchant")),amt,data["card"],option(data.get("category"),CATEGORIES),due.isoformat(),due.day))
        return
    row=c.execute("SELECT * FROM recurring WHERE id=?",(data.get("id"),)).fetchone()
    if not row or row["due"]!=data.get("due"): raise ValueError("This bill has changed. Refresh the tracker.")
    if action=="remove-recurring":
        c.execute("DELETE FROM recurring WHERE id=?",(row["id"],)); return
    if action=="log-recurring":
        if row["due"]>today().isoformat(): raise ValueError("This bill can be logged on or after its due date.")
        if not data.get("link"):
            save_entry(c,dict(merchant=row["merchant"],amount=row["amount"]/100,day=row["due"],card=row["card"],category=row["category"],kind="Purchase"),"Recurring")
        else:
            match=c.execute("SELECT 1 FROM entries WHERE id=? AND amount=? AND card=? AND kind='Purchase' AND substr(day,1,7)=?",(data["link"],row["amount"],row["card"],row["due"][:7])).fetchone()
            if not match: raise ValueError("Select a matching transaction.")
    d=month_shift(date.fromisoformat(row["due"]),1)
    due=d.replace(day=min(row["anchor"],calendar.monthrange(d.year,d.month)[1]))
    c.execute("UPDATE recurring SET due=? WHERE id=?",(due.isoformat(),row["id"]))


def copy_budgets(con, data):
    month = str(data.get("month",""))
    if not re.fullmatch(r"20\d\d-(?:0[1-9]|1[0-2])", month):
        raise ValueError("Choose a valid month.")
    prior = month_shift(date.fromisoformat(month+"-01"),-1).strftime("%Y-%m")
    con.execute("""INSERT OR IGNORE INTO budgets(month,category,amount)
                   SELECT ?,category,amount FROM budgets WHERE month=?""",(month,prior))
