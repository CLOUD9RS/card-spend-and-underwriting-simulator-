"""Read-only, opt-in Mac adapters. Raw messages are discarded after parsing."""
import hashlib
import json
import os
import plistlib
import re
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from ledger import db, IST, save_entry, today

MAIL_DOMAINS = {"HDFC Bank": ("hdfcbank.net","hdfcbank.com","hdfc.bank.in"), "Kotak Mahindra Bank": ("kotak.com","kotak.bank.in","kotak811.bank.in")}
SMS_IDS = {"HDFC Bank": ("HDFCBK","HDFCBN","HDFCCC","HDFCBA"), "Kotak Mahindra Bank": ("KOTAKB","KOTAK","KOTAKM","KOTAKC")}
APPLE_EPOCH = 978307200
LOCK = threading.Lock()

def issuer(sender, channel):
    if channel == "Mail":
        host = sender.lower().rsplit("@",1)[-1]
        return next((bank for bank,ds in MAIL_DOMAINS.items() if any(host==d or host.endswith("."+d) for d in ds)),None)
    return next((bank for bank,ids in SMS_IDS.items() if re.fullmatch(r"(?:[A-Z]{2}-)?(?:"+"|".join(ids)+r")(?:-[A-Z])?",sender.upper())),None)

def attributed_text(data):
    if not data: return ""
    if data.startswith(b"bplist"):
        try:
            items=plistlib.loads(data).get("$objects",[])
            return max((v for v in items if isinstance(v,str) and " " in v),key=len,default="")
        except (ValueError,TypeError,OverflowError): return ""
    # NSAttributedString typedstream encodes the NSString as '+', followed by a compact length.
    start=data.find(b'\x01+',data.find(b'NSString') if b'NSString' in data else 0)
    if start==-1 or start+3>len(data): return ""
    p=start+2
    n=data[p]; p+=1
    if n in (0x81,0x82):
        size=2 if n==0x81 else 4
        n=int.from_bytes(data[p:p+size],"little"); p+=size
    if n>14000 or p+n>len(data): return ""
    return data[p:p+n].decode("utf-8","replace")

def sms_rows(since, location=None):
    location = location or Path.home()/"Library/Messages/chat.db"
    con=sqlite3.connect(location.resolve().as_uri()+"?mode=ro",uri=True,timeout=4)
    try:
        con.execute("PRAGMA query_only=ON")
        patterns=[f"%{code}%" for codes in SMS_IDS.values() for code in codes]
        query="SELECT m.guid,h.id,m.date,m.text,m.attributedBody FROM message m JOIN handle h ON m.handle_id=h.ROWID WHERE m.is_from_me=0 AND m.date >= ? AND ("+" OR ".join("UPPER(h.id) LIKE ?" for _ in patterns)+") ORDER BY m.date"
        for key,sender,stamp,body,blob in con.execute(query,[int((since-APPLE_EPOCH)*1e9),*patterns]):
            if issuer(sender,"SMS"):
                yield dict(key=key,sender=sender,stamp=stamp/1e9+APPLE_EPOCH,text=body or attributed_text(blob))
    finally: con.close()

def mail_rows(since):
    p=subprocess.run(["/usr/bin/osascript","-l","JavaScript",str(Path(__file__).with_name("mail-reader.js")),str(since)],capture_output=True,timeout=95)
    if p.returncode: raise RuntimeError("Check that your account is in Apple Mail and allow Mail automation in macOS Privacy & Security.")
    return json.loads(p.stdout or b"[]")

def category_for(name):
    for category,words in {"Dining":"swiggy|zomato|cafe|coffee|tokai|restaurant","Shopping":"amazon|myntra|nykaa|croma|westside|flipkart","Travel":"indigo|air india|hotel|irctc","Transport":"uber|ola cabs|metro","Groceries":"bigbasket|dmart|blinkit|grocer","Fuel":"petrol|indian oil|bharat petroleum","Bills":"airtel|jio|electricity"}.items():
        if re.search(words,name,re.I): return category
    return "Other"

def parse(row, channel):
    bank=issuer(row["sender"],channel)
    if not bank: return None
    raw=" ".join((row.get("text") or "")[:16000].split())
    if re.search(r"\bOTP\b|one.time password|\bdeclined\b|\bfailed\b|bill (?:is )?due|payment (?:of .*? )?received|payment towards|payment has been received|minimum amount due|statement (?:is|has been) generated|debit card",raw,re.I): return None
    kind="Refund" if re.search(r"\b(refunded|reversed|refund (?:of|for)|reversal of)\b",raw,re.I) else "Purchase"
    action=r"\b(spent|debited|charged|used|purchase(?:d)?|transaction(?: of)?)\b"
    if kind=="Purchase" and not re.search(action,raw,re.I): return None
    if not re.search(r"\b(?:credit\s*card|card|ccard|cc)\b",raw,re.I): return None
    # Never pick the available balance/limit if no purchase amount was present.
    part=re.split(r"\b(?:avl\.?|available|remaining|total credit limit|not you|dispute|if not|report fraud)\b",raw,flags=re.I)[0]
    cur=r"(?:INR\.?|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)"
    amounts=re.findall(cur,part,re.I)
    if len(set(amounts))!=1: return None
    from ledger import money
    try: amt=money(amounts[0].replace(",",""))
    except ValueError: return None
    if not amt: return None
    match=re.search(r"(?:card|cc)\s*(?:(?:ending|end|no\.?|number|xx|x|[*•])\s*)*(?:in\s*)?[:#-]?\s*(?:[x*•\s-]+)?(\d{4})\b",part,re.I)
    if not match: match=re.search(r"(?:\bend(?:ing)?\s*(?:in|with)?\s*|[x*•]{2,})[ :*-]*(\d{4})\b",part,re.I)
    last=match.group(1) if match else ""
    stamp=float(row["stamp"])
    day=datetime.fromtimestamp(stamp,IST).date()
    d=re.search(r"\b(\d{1,2}[-/](?:\d{1,2}|[A-Za-z]{3})[-/]\d{2,4})\b",part)
    if d:
        for f in ("%d-%m-%Y","%d-%m-%y","%d-%b-%Y","%d-%b-%y"):
            try: day=datetime.strptime(d[1].replace("/","-"),f).date(); break
            except ValueError: continue
    if day>today() or day.year<2000: return None
    merch=re.search(r"\b(?:at|towards|merchant\s*[:=])\s+(.{2,100}?)(?=\s+(?:on\b|using\b|with\b|via\b|for\s+(?:Rs|INR)|at\s+\d|ref\b)|[.;]|$)",part,re.I)
    name=merch[1].strip(" ,-:") if merch else ""
    if re.search(r"(?:\d[ -]?){8,}|https?://|@",name) or re.match(r"\d{1,2}:\d\d",name): name=""
    reference=re.search(r"\b(?:rrn|ref(?:erence)?(?:\s*(?:no|id))?)\.?\s*[:#-]?\s*([A-Z0-9]{6,24})\b",part,re.I)
    uid=hashlib.sha256((channel+"|"+str(row["key"])).encode()).hexdigest()
    return dict(uid=uid,channel=channel,bank=bank,last4=last,merchant=name[:70] or "Unknown merchant",amount=amt,day=day.isoformat(),kind=kind,stamp=stamp,reference=reference[1].upper() if reference else "")

def ingest(c, a):
    if c.execute("SELECT 1 FROM alerts WHERE uid=?",(a["uid"],)).fetchone(): return 0
    card=c.execute("SELECT id FROM cards WHERE bank=? AND last4=? AND last4!=''",(a["bank"],a["last4"])).fetchone()
    status,entry="review",None
    if card and a["merchant"]!="Unknown merchant":
        matches=c.execute("""SELECT a.* FROM alerts a WHERE bank=? AND last4=? AND amount=? AND day=? AND kind=? AND status='posted' AND channel!=? AND NOT EXISTS(SELECT 1 FROM alerts b WHERE b.entry=a.entry AND b.channel=?)""",(a["bank"],a["last4"],a["amount"],a["day"],a["kind"],a["channel"],a["channel"])).fetchall()
        matches=[m for m in matches if not (m["reference"] and a["reference"] and m["reference"]!=a["reference"]) and ((m["reference"] and m["reference"]==a["reference"]) or (abs(m["stamp"]-a["stamp"])<300 and m["merchant"].casefold()==a["merchant"].casefold()))]
        if len(matches)==1:
            status,entry="linked",matches[0]["entry"]
        else:
            # A possibly matching alert with different punctuation/timing or a manual entry needs review.
            uncertain=c.execute("SELECT 1 FROM entries WHERE card=? AND amount=? AND day=? AND kind=? AND source!=?",(card[0],a["amount"],a["day"],a["kind"],a["channel"])).fetchone()
            if not uncertain:
                entry=save_entry(c,dict(merchant=a["merchant"],amount=a["amount"]/100,day=a["day"],card=card[0],category=category_for(a["merchant"]),kind=a["kind"]),a["channel"])
                status="posted"
    c.execute("""INSERT INTO alerts(uid,channel,bank,last4,merchant,amount,day,kind,stamp,reference,status,entry)
                VALUES(:uid,:channel,:bank,:last4,:merchant,:amount,:day,:kind,:stamp,:reference,:status,:entry)""",{**a,"status":status,"entry":entry})
    return int(status=="posted")

def scan():
    if not LOCK.acquire(blocking=False): return
    try:
        for channel,reader in [("Mail",mail_rows),("SMS",sms_rows)]:
            with db("live") as c:
                info=c.execute("SELECT * FROM sources WHERE name=?",(channel,)).fetchone()
            if not info["enabled"]: continue
            now=time.time()
            try:
                if sys.platform!="darwin": raise RuntimeError("Automatic import requires macOS.")
                since=info["checked"]-3600 if info["checked"] else now-30*86400
                rows=list(reader(since))
                with db("live") as c:
                    c.execute("BEGIN IMMEDIATE")
                    if not c.execute("SELECT enabled FROM sources WHERE name=?",(channel,)).fetchone()[0]: continue
                    added=skipped=0
                    from wealth import update_from_alert
                    for row in rows:
                        balance=update_from_alert(c,row.get("text",""),issuer(row["sender"],channel),row["stamp"],channel)
                        a=parse(row,channel)
                        if a: added+=ingest(c,a)
                        elif not balance: skipped+=1
                    c.execute("UPDATE sources SET checked=?,error='',imported=imported+?,skipped=? WHERE name=?",(now,added,skipped,channel))
            except (OSError,RuntimeError,sqlite3.Error,subprocess.SubprocessError,ValueError) as e:
                msg="Allow Full Disk Access for Cardfolio (or the terminal running the server), then reopen it. Make sure iPhone texts appear in Messages." if channel=="SMS" else "Check your Apple Mail inbox and allow Mail automation in System Settings → Privacy & Security → Automation. Then try again."
                with db("live") as c: c.execute("UPDATE sources SET error=? WHERE name=?",(msg,channel))
    finally: LOCK.release()

def trigger():
    threading.Thread(target=scan,daemon=True).start()

def poll():
    while True:
        scan()
        time.sleep(300)
