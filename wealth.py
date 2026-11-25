"""Balances, stock positions and optional read-only Upstox market quotes."""
import json
import os
import re
import threading
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from ledger import BANKS, IST, db, integer, iso_day, label, money, option, today

SCHEMA = """
CREATE TABLE IF NOT EXISTS wealth_accounts(
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, bank TEXT NOT NULL,
 last4 TEXT NOT NULL, balance INTEGER NOT NULL, stamp REAL NOT NULL, source TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS wealth_match ON wealth_accounts(bank,last4) WHERE kind='Savings' AND last4!='' AND bank!='Other';
CREATE TABLE IF NOT EXISTS positions(
 id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, exchange TEXT NOT NULL, isin TEXT NOT NULL,
 shares INTEGER NOT NULL, cost INTEGER NOT NULL, price INTEGER, previous INTEGER, quoted TEXT,
 source TEXT NOT NULL, acquired TEXT NOT NULL);
"""
KINDS = ["Savings","Fixed deposit","Cash","Other asset","Loan","Card dues"]
DEBTS = {"Loan","Card dues"}
quote_lock = threading.Lock()
session_token = None

def stamp(day):
    # A dated manual balance is authoritative through the time entered that day.
    end = datetime.fromisoformat(day+"T23:59:59").replace(tzinfo=IST).timestamp()
    return min(end,time.time())

def seed(con):
    now=time.time()
    con.executemany("INSERT INTO wealth_accounts(name,kind,bank,last4,balance,stamp,source) VALUES(?,?,?,?,?,?,'Sample')",[
        ("Everyday savings","Savings",BANKS[0],"8092",18645000,now),
        ("Fixed deposit","Fixed deposit",BANKS[0],"",25000000,now),
        ("Card statement","Card dues",BANKS[0],"",1850000,now)])
    con.executemany("INSERT INTO positions(symbol,exchange,isin,shares,cost,price,previous,quoted,source,acquired) VALUES(?,?,?,?,?,?,?,?,?,?)",[
        ("INFY","NSE","INE009A01021",12,139500,148230,146180,today().isoformat(),"Sample",today().isoformat()),
        ("HDFCBANK","NSE","INE040A01034",30,88900,94250,95000,today().isoformat(),"Sample",today().isoformat())])

def save_account(con, data):
    kind=option(data.get("kind"),KINDS)
    last=str(data.get("last4","")).strip()
    if last and not re.fullmatch(r"[0-9]{4}",last): raise ValueError("Enter only four account-ending digits.")
    balance=money(data.get("balance"))
    fields=(label(data.get("name")),kind,option(data.get("bank","Other"),BANKS),last,balance,stamp(iso_day(data.get("asof"))),"Manual")
    if data.get("id"):
        if not con.execute("UPDATE wealth_accounts SET name=?,kind=?,bank=?,last4=?,balance=?,stamp=?,source=? WHERE id=?",fields+(data["id"],)).rowcount:
            raise ValueError("The balance record was removed.")
    else:
        if last and kind=="Savings" and con.execute("SELECT id FROM wealth_accounts WHERE kind=? AND bank=? AND last4=?",(kind,fields[2],last)).fetchone():
            raise ValueError("A savings account with this bank and ending already exists.")
        con.execute("INSERT INTO wealth_accounts(name,kind,bank,last4,balance,stamp,source) VALUES(?,?,?,?,?,?,?)",fields)

def update_from_alert(con, body, bank, timestamp, channel):
    if not bank or re.search(r"\b(?:OTP|credit card|credit limit|available limit|overdraft)\b",body,re.I):
        return False
    accounts=set(re.findall(r"(?:\ba\s*/\s*c|\bacct\b|\baccount\b)\s*(?:no\.?|number|ending(?:\s+in)?)?\s*[:#-]?\s*[xX*•-]*\s*(\d{4})\b",body,re.I))
    values=set(re.findall(r"\b(?:available|avail\.?|avl\.?|closing)\s+(?:bal(?:ance)?\.?)\s*(?:is|of|:|-)?\s*(?:INR|Rs\.?|₹)\s*([0-9][0-9,]*(?:\.\d{1,2})?)(?![\d.])",body,re.I))
    if len(accounts)!=1 or len(values)!=1 or re.search(r"(?:balance|bal\.)[^\n]{0,16}(?:-\s*₹|(?:Rs\.?|INR|₹)\s*-)",body,re.I): return False
    try: value=money(values.pop().replace(",",""))
    except ValueError: return False
    changed=con.execute("""UPDATE wealth_accounts SET balance=?,stamp=?,source=?
          WHERE kind='Savings' AND bank=? AND last4=? AND stamp<?""",
          (value,timestamp,channel,bank,accounts.pop(),timestamp))
    return changed.rowcount>0

def save_position(con,data):
    symbol=str(data.get("symbol","")).strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9&.\-]{0,24}",symbol): raise ValueError("Enter a valid exchange symbol.")
    ex=option(data.get("exchange"),["NSE","BSE"])
    isin=str(data.get("isin","")).strip().upper()
    if isin and not re.fullmatch(r"IN[A-Z0-9]{9}[0-9]",isin): raise ValueError("Use the 12-character Indian ISIN from your holding statement.")
    qty=integer(data.get("shares"),1,10000000,"Shares")
    cost=money(data.get("cost"))
    if not cost: raise ValueError("Enter an average purchase price above zero.")
    acquired=iso_day(data.get("acquired"))
    fields=(symbol,ex,isin,qty,cost,acquired)
    if data.get("id"):
        old=con.execute("SELECT * FROM positions WHERE id=?",(data["id"],)).fetchone()
        if not old: raise ValueError("This holding has been removed.")
        if (symbol,ex,isin)!=(old["symbol"],old["exchange"],old["isin"]):
            con.execute("UPDATE positions SET price=NULL,previous=NULL,quoted=NULL,source='Unpriced' WHERE id=?",(data["id"],))
        con.execute("UPDATE positions SET symbol=?,exchange=?,isin=?,shares=?,cost=?,acquired=? WHERE id=?",fields+(data["id"],))
        key=data["id"]
    else:
        key=con.execute("INSERT INTO positions(symbol,exchange,isin,shares,cost,acquired,source) VALUES(?,?,?,?,?,?,'Unpriced')",fields).lastrowid
    if data.get("price") not in ["",None]:
        price=money(data["price"])
        if not price: raise ValueError("Enter a positive market price.")
        con.execute("UPDATE positions SET price=?,previous=NULL,quoted=?,source='Manual' WHERE id=?",(price,iso_day(data.get("quoteDay") or today().isoformat()),key))

def read_state(con):
    balances=[dict(x) for x in con.execute("SELECT * FROM wealth_accounts ORDER BY id")]
    holdings=[dict(x) for x in con.execute("SELECT * FROM positions ORDER BY symbol,id")]
    for a in balances: a["asof"]=datetime.fromtimestamp(a["stamp"],IST).date().isoformat()
    return {"balances":balances,"holdings":holdings,"marketConnected":bool(session_token or os.environ.get("UPSTOX_ANALYTICS_TOKEN"))}

def set_token(token):
    global session_token
    token=str(token or "").strip()
    if token and (not 12<=len(token)<=8192 or not token.isascii() or any(c.isspace() for c in token)):
        raise ValueError("Enter a valid Upstox analytics token.")
    session_token=token or None

def fetch_quotes(keys, token):
    url="https://api.upstox.com/v3/market-quote/ltp?"+urlencode({"instrument_key":",".join(keys)})
    request=Request(url,headers={"Authorization":"Bearer "+token,"Accept":"application/json"})
    try:
        with urlopen(request,timeout=10) as resp: payload=json.loads(resp.read(2_000_000))
    except HTTPError as e:
        if e.code in (401,403): raise ValueError("Upstox rejected the token or market-data entitlement.") from None
        raise ValueError("Upstox could not complete this quote request. Try again later.") from None
    except (URLError,OSError,ValueError): raise ValueError("Market data is unavailable. Your saved prices are preserved.") from None
    if not isinstance(payload,dict) or payload.get("status")!="success" or not isinstance(payload.get("data"),dict): raise ValueError("Upstox returned an unexpected response.")
    quotes={}
    for item in payload["data"].values():
        if not isinstance(item,dict): continue
        key=item.get("instrument_token")
        if key in keys:
            try:
                price=money(item["last_price"])
                previous=money(item["cp"]) if item.get("cp") else None
                if price: quotes[key]=(price,previous)
            except (ValueError,KeyError): continue
    return quotes

def refresh(mode):
    if mode!="live": raise ValueError("Use My portfolio to fetch market quotes.")
    token=session_token or os.environ.get("UPSTOX_ANALYTICS_TOKEN")
    if not token: raise ValueError("Connect a read-only Upstox analytics token on the Mac.")
    if not quote_lock.acquire(blocking=False): raise ValueError("A price refresh is already running.")
    try:
        with db(mode) as con:
            keys=sorted({r[0]+"_EQ|"+r[1] for r in con.execute("SELECT DISTINCT exchange,isin FROM positions WHERE isin!=''")})
        if not keys: raise ValueError("Add an ISIN to a holding before refreshing prices.")
        quotes={}
        for i in range(0,len(keys),200): quotes.update(fetch_quotes(keys[i:i+200],token))
        if not quotes: raise ValueError("No prices were returned. Check each exchange and ISIN.")
        with db(mode) as con:
            for key,(price,previous) in quotes.items():
                exchange,isin=key.split("_EQ|")
                con.execute("UPDATE positions SET price=?,previous=?,quoted=?,source='Upstox LTP' WHERE exchange=? AND isin=?",
                            (price,previous,datetime.now(IST).isoformat(timespec='seconds'),exchange,isin))
        return {"updated":len(quotes),"requested":len(keys)}
    finally: quote_lock.release()
