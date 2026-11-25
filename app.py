#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sqlite3
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import phone
import wealth
import archives
import statements
import importer
import credit
from ledger import db, initialize, option, save_card, save_entry, state, save_budget, recurring_action

STATIC=Path(__file__).with_name("static")
MIMES={"index.html":"text/html","app.js":"text/javascript","style.css":"text/css","icon.svg":"image/svg+xml"}
MIMES.update({"workspace.js":"text/javascript","theme.js":"text/javascript","manifest.webmanifest":"application/manifest+json","app-icon.png":"image/png","regalia-gold-mastercard.png":"image/png","dream-different.webp":"image/webp"})
CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

def dispatch(req):
    mode=option(req.get("mode"),["demo","live"])
    action=req.get("action")
    data=req.get("data") or {}
    if not isinstance(data,dict): raise ValueError("Invalid form.")
    if action=="parse-report": return {"extracted":credit.parse_report(data)}
    if action in {"snapshot", "restore"}:
        with importer.LOCK:
            if action=="snapshot": archives.snapshot(mode)
            else: archives.restore(mode,data.get("file"))
        action="state"
    quote_result=None
    if action=="market-token":
        if mode!="live": raise ValueError("Configure market data in My portfolio.")
        wealth.set_token(data.get("token"))
        action="state"
    if action=="quotes":
        quote_result=wealth.refresh(mode)
        action="state"
    start_scan=False
    with db(mode) as c:
        if action!="state": c.execute("BEGIN IMMEDIATE")
        if action=="artwork":
            card=c.execute("SELECT id FROM cards WHERE id=? AND id>0",(data.get("id"),)).fetchone()
            if not card: raise ValueError("Select a card.")
            image=data.get("image","")
            key="art-"+str(card[0])
            if image:
                raw=base64.b64decode(image,validate=True)
                if len(raw)>400000 or not raw.startswith(bytes.fromhex("ffd8ff")):
                    raise ValueError("Choose a smaller card image.")
                c.execute("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)",(key,image))
            else: c.execute("DELETE FROM meta WHERE k=?",(key,))
        elif action=="balance": wealth.save_account(c,data)
        elif action=="holding": wealth.save_position(c,data)
        elif action in {"remove-balance","remove-holding"}:
            table="positions" if action=="remove-holding" else "wealth_accounts"
            c.execute(f"DELETE FROM {table} WHERE id=?",(data["id"],))
        elif action in {"csv-preview","csv-post"}:
            result=statements.statement(c,data.get("text"),post=action=="csv-post")
            if action=="csv-preview": return result
        elif action=="copy-budgets":
            from ledger import copy_budgets
            copy_budgets(c,data)
        elif action=="profile":
            c.execute("INSERT OR REPLACE INTO meta(k,v) VALUES('profile',?)",(json.dumps(credit.clean(data)),))
        elif action=="card": save_card(c,data)
        elif action=="entry": save_entry(c,data)
        elif action=="budget": save_budget(c,data)
        elif action in ["recurring","remove-recurring","log-recurring","skip-recurring"]: recurring_action(c,action,data)
        elif action=="remove":
            c.execute("UPDATE alerts SET status='dismissed',entry=NULL WHERE entry=?",(data["id"],))
            c.execute("DELETE FROM entries WHERE id=?",(data["id"],))
        elif action=="source":
            if mode!="live": raise ValueError("Switch to My portfolio to connect a source.")
            source=option(data["name"],["Mail","SMS"])
            enabled=data.get("enabled") is True
            if enabled and not c.execute("SELECT 1 FROM wealth_accounts WHERE kind='Savings' AND last4!='' AND bank!='Other'").fetchone() and not c.execute("SELECT COUNT(*) FROM cards WHERE last4!='' AND bank!='Other'").fetchone()[0]:
                raise ValueError("Save the last four digits of an HDFC or Kotak card in My cards first.")
            c.execute("UPDATE sources SET enabled=?,error='' WHERE name=?",(int(enabled),source))
            start_scan=enabled
        elif action=="scan":
            if mode!="live": raise ValueError("Switch to My portfolio first.")
            start_scan=True
        elif action=="review":
            row=c.execute("SELECT * FROM alerts WHERE uid=? AND status='review'",(data["uid"],)).fetchone()
            if not row: raise ValueError("This alert has already been reviewed.")
            result=option(data["decision"],["dismiss","post"])
            entry=None
            if result=="post":
                entry=save_entry(c,{**data,"id":None},row["channel"])
            c.execute("UPDATE alerts SET status=?,entry=? WHERE uid=?",("posted" if entry else "dismissed",entry,row["uid"]))
        elif action!="state": raise ValueError("Unknown operation.")
        output=state(c,mode)
        output.update(wealth.read_state(c))
        output["artwork"]={r["k"][4:]:r["v"] for r in c.execute("SELECT k,v FROM meta WHERE k LIKE 'art-%'")}
        if quote_result: output["quoteResult"]=quote_result
    if start_scan: importer.trigger()
    output["snapshots"]=archives.list_backups(mode)
    output["scanning"]=importer.LOCK.locked() if mode=="live" else False
    return output

def response(req, remote=False):
    try:
        if not isinstance(req,dict): raise ValueError("Invalid request.")
        action=req.get("action")
        if remote and action not in phone.PHONE_ACTIONS:
            raise ValueError("Use Cardfolio on your Mac to manage this setting.")
        if action in phone.MAC_ACTIONS:
            return {"ok":True,"state":phone.link.control(action,PhoneHandler)}
        result=dispatch(req)
        if "entries" in result and not remote:
            result["phone"]=phone.link.status()
        if remote: result.pop("snapshots", None)
        return {"ok":True,"state":result}
    except (ValueError,KeyError,TypeError) as exc: return {"ok":False,"error":str(exc) or "Check the form and try again."}
    except (OSError,sqlite3.Error): return {"ok":False,"error":"Could not access the local ledger. Check free space and file permissions."}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self,status,body,mime,headers=None):
        self.send_response(status)
        for key,value in {"Content-Type":(mime+"; charset=utf-8" if mime.startswith(("text/","application/")) else mime),"Content-Length":str(len(body)),"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":CSP,"Referrer-Policy":"no-referrer","X-Frame-Options":"DENY"}.items(): self.send_header(key,value)
        for key,value in (headers or {}).items(): self.send_header(key,value)
        self.end_headers()
        self.wfile.write(body)
    def allowed(self):
        port=self.server.server_port
        return self.headers.get("Host") in {f"127.0.0.1:{port}",f"localhost:{port}"}
    def do_GET(self):
        if not self.allowed(): return self.send(403,b"Local access only","text/plain")
        key=urlsplit(self.path).path.removeprefix("/") or "index.html"
        if key not in MIMES or not (STATIC/key).is_file(): return self.send(404,b"Not found","text/plain")
        self.send(200,(STATIC/key).read_bytes(),MIMES[key])
    scheme="http"
    remote=False
    def post_allowed(self):
        return (self.allowed() and self.headers.get("Origin")==self.scheme+"://"+self.headers.get("Host","")
                and self.headers.get("X-Cardfolio")=="local" and self.headers.get_content_type()=="application/json")

    def body(self,limit):
        size=int(self.headers.get("Content-Length",0))
        if size<=0 or size>limit: raise ValueError
        payload=json.loads(self.rfile.read(size))
        if not isinstance(payload,dict): raise ValueError
        return payload

    def do_POST(self):
        if not self.post_allowed() or self.path!="/api":
            return self.send(403,b"Local access only","text/plain")
        if self.remote and not phone.link.authorized(self.headers.get("Cookie")):
            return self.send(401,b"Pair this phone","text/plain")
        try: req=self.body(12*1024*1024)
        except (ValueError,UnicodeError): return self.send(400,b"Invalid request","text/plain")
        result=response(req,remote=self.remote)
        self.send(200 if result["ok"] else 400,json.dumps(result).encode(),"application/json")

class PhoneHandler(Handler):
    scheme="https"
    remote=True
    timeout=20

    def setup(self):
        self.request.settimeout(self.timeout)
        self.request=self.server.phone_tls.wrap_socket(self.request,server_side=True)
        super().setup()

    def finish(self):
        try: super().finish()
        finally: self.request.close()

    def allowed(self):
        ip,port=self.server.server_address[:2]
        return self.headers.get("Host")==f"{ip}:{port}"

    def do_POST(self):
        if self.path!="/pair": return super().do_POST()
        if not self.post_allowed(): return self.send(403,b"Invalid origin","text/plain")
        try: data=self.body(512)
        except (ValueError,UnicodeError): return self.send(400,b"Invalid request","text/plain")
        token=phone.link.pair(data.get("code",""))
        if not token: return self.send(403,b"Pairing code unavailable","text/plain")
        cookie=f"{phone.COOKIE}={token}; Path=/; Max-Age={phone.LIFETIME}; Secure; HttpOnly; SameSite=Strict"
        self.send(200,b'{"ok":true}',"application/json",{"Set-Cookie":cookie})

def main():
    parser=argparse.ArgumentParser(description="Cardfolio local web app")
    parser.add_argument("--stdio",action="store_true")
    parser.add_argument("--port",type=int,default=8765)
    args=parser.parse_args()
    initialize()
    threading.Thread(target=importer.poll,daemon=True).start()
    if args.stdio:
        for line in sys.stdin:
            try: payload=response(json.loads(line))
            except ValueError: payload={"ok":False,"error":"Invalid request."}
            print(json.dumps(payload,separators=(",",":")),flush=True)
    else:
        with ThreadingHTTPServer(("127.0.0.1",args.port),Handler) as server:
            print(f"Cardfolio is available at http://127.0.0.1:{server.server_port}",flush=True)
            server.serve_forever()

if __name__=="__main__": main()
