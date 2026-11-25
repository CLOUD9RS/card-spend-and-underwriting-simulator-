import base64
import http.client
import json
import socket
import ssl
import sys
import tempfile
import threading
import time
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import app
import archives
import importer
import ledger
import phone
import wealth


class LedgerTests(unittest.TestCase):
    def setUp(self):
        root=tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        override=patch.object(ledger,"ROOT",Path(root.name))
        override.start(); self.addCleanup(override.stop)
        ledger.initialize()
        self.day=ledger.today().isoformat()

    def api(self,action="state",mode="live",**data):
        reply=app.response(dict(mode=mode,action=action,data=data))
        self.assertTrue(reply['ok'],reply.get('error'))
        return reply["state"]

    def entry(self,**overrides):
        return self.api("entry",**dict(dict(merchant="Bookshop",card=1,amount="599.99",category="Shopping",kind="Purchase",day=self.day),**overrides))

    def test_existing_data_and_rewards(self):
        self.assertEqual(self.api()["entries"],[])
        self.assertGreater(len(self.api(mode="demo")["entries"]),0)
        state=self.entry()
        self.assertEqual((state["entries"][0]["amount"],state["entries"][0]["points"]),(59999,10))
        self.entry(kind="Refund")
        ledger.initialize()
        self.assertEqual(sum(x["net"] for x in self.api()["entries"]),0)
        self.assertEqual(self.entry(category="Fuel")["entries"][0]["points"],0)
        self.assertEqual(self.entry(override=8)["entries"][0]["points"],8)

    def test_duplicate_alerts_and_unmatched_review(self):
        now=time.time()
        body="Rs. 1,299.00 spent on HDFC Bank Credit Card XX4821 at AMAZON. Avl limit Rs. 93,000"
        def alert(ch,key,text=body):
            return importer.parse(dict(text=text,stamp=now,key=key,sender="AD-HDFCBK-S" if ch=="SMS" else "alerts@hdfcbank.net"),ch)
        sms=alert("SMS","1"); mail=alert("Mail","2")
        self.assertEqual(sms["merchant"],"AMAZON")
        self.assertIsNone(alert("SMS","3","OTP for Rs. 1299 on credit card XX4821"))
        with ledger.db("demo") as c:
            self.assertEqual([importer.ingest(c,a) for a in [sms,sms,mail]],[1,0,0])
            self.assertEqual(c.execute("SELECT COUNT(DISTINCT entry) FROM alerts").fetchone()[0],1)
        with ledger.db("live") as c: importer.ingest(c,sms)
        self.assertEqual(len(self.api()["review"]),1)
        self.api("review",decision="dismiss",uid=sms["uid"])
        self.assertEqual(self.api()["entries"],[])

    def test_savings_balance_requires_matching_newer_alert(self):
        self.api("balance",name="Test bank",kind="Savings",bank="HDFC Bank",last4="1234",balance=300,asof="2025-01-01")
        t=time.time()
        with ledger.db("live") as c:
            def apply(text,stamp=t): return wealth.update_from_alert(c,text,"HDFC Bank",stamp,"SMS")
            self.assertTrue(apply("A/c xx1234 debited. Avl Bal: INR 9,123.50"))
            self.assertFalse(apply("A/c xx1234: Avl Bal: INR 1",t-100))
            self.assertFalse(apply("Credit card linked to A/c xx1234. Avl Bal: INR 12",t+1))
            self.assertFalse(apply("A/c xx7777. Avl Bal: INR 12",t+1))
        self.assertEqual(self.api()["balances"][0]["balance"],912350)

    def test_monthly_bills_and_budgets_are_idempotent(self):
        self.api("budget",month="2026-01",category="Dining",amount=1000)
        self.api("budget",month="2026-02",category="Dining",amount=200)
        self.api("copy-budgets",month="2026-02")
        self.assertEqual(next(r for r in self.api()["budgets"] if r["month"]=="2026-02")["amount"],20000)
        bill=self.api("recurring",merchant="Phone plan",amount=299,card=-2,category="Bills",due="2026-01-31")["recurring"][0]
        data=dict(id=bill["id"],due=bill["due"])
        s=self.api("log-recurring",**data)
        self.assertEqual(s["recurring"][0]["due"],"2026-02-28")
        self.assertFalse(app.response(dict(action="log-recurring",mode="live",data=data))["ok"])
        self.assertEqual(len(self.api()["entries"]),1)

    def test_import_is_atomic_and_repeatable(self):
        text="Date,Merchant,Payment method,Amount,Category\n"+self.day+",Shop,Cash,399,Dining\n"
        self.assertEqual(self.api("csv-preview",text=text)["added"],1)
        self.assertFalse(self.api()["entries"])
        bad=text+self.day+",Other,Missing account,2,Shopping\n"
        self.assertFalse(app.response(dict(mode="live",action="csv-post",data={"text":bad}))["ok"])
        self.assertFalse(self.api()["entries"])
        self.api("csv-post",text=text)
        self.assertEqual(self.api("csv-preview",text=text)["duplicates"],1)
        self.api("csv-post",text=text)
        self.assertEqual(len(self.api()["entries"]),1)

    def test_checked_recovery_preserves_current_version(self):
        self.entry()
        snap=self.api("snapshot")["snapshots"][0]["file"]
        self.entry(merchant="Second")
        with ledger.db("live") as c:c.execute("UPDATE sources SET enabled=1 WHERE name='SMS'")
        restored=self.api("restore",file=snap)
        self.assertEqual(len(restored["entries"]),1)
        self.assertFalse(any(src["enabled"] for src in restored["sources"]))
        saved=next(x["file"] for x in restored["snapshots"] if x["file"]!=snap)
        self.assertEqual(len(self.api("restore",file=saved)["entries"]),2)
        with self.assertRaises(ValueError): archives.restore("demo",snap)
        with self.assertRaises(ValueError): archives.restore("live","../file")

    def test_credit_import_requires_review(self):
        txt="CIBIL Score: 766\nUtilisation: 13%\nEnquiries last 6 months: 2\n"
        extract=lambda s: self.api("parse-report",content=base64.b64encode(s.encode()).decode(),ext="txt")["extracted"]
        self.assertEqual(extract(txt),{"score":766,"util":13,"enquiries":2})
        self.assertNotIn("score",extract("CIBIL Score: 300–900"))
        self.assertEqual(self.api()["profile"],{})
        self.api("profile",**extract(txt))
        self.assertEqual(self.api()["profile"]["score"],766)

    def test_quotes_with_provider_fixture_and_unavailable_provider(self):
        key="NSE_EQ|INE009A01021"
        fixture={"status":"success","data":{"NSE_EQ:INFY":{"instrument_token":key,"last_price":1450.25,"cp":1400}}}
        self.api("holding",symbol="INFY",exchange="NSE",isin="INE009A01021",shares=3,cost=1100,acquired=self.day)
        with patch.object(wealth,"session_token","dummy-test-value"),patch.object(wealth,"urlopen",return_value=BytesIO(json.dumps(fixture).encode())) as mock:
            state=self.api("quotes"); self.assertIn("instrument_key=",mock.call_args.args[0].full_url)
            h=state["holdings"][0];self.assertEqual((h["price"],h["previous"]),(145025,140000))
            self.assertEqual((h["price"]-h["cost"])*h["shares"],105075)
        with patch.object(wealth,"session_token","dummy-test-value"),patch.object(wealth,"urlopen",side_effect=OSError):
            self.assertFalse(app.response(dict(mode="live",action="quotes"))["ok"])
        self.assertEqual(self.api()["holdings"][0]["price"],145025)

    def test_tls_pairing_and_phone_requests(self):
        # Use a connected byte stream so the full TLS/HTTP stack works on restricted build hosts.
        host="192.168.3.10"
        identity=phone.identity(host)
        self.assertEqual(identity,phone.identity(host))
        self.assertEqual(sorted(x.name for x in identity.iterdir()),["Cardfolio.cer","server.key","server.pem"])
        self.assertEqual(identity.joinpath("server.key").stat().st_mode&0o777,0o600)
        ca=ssl.DER_cert_to_PEM_cert(identity.joinpath("Cardfolio.cer").read_bytes())
        client=ssl.create_default_context(cadata=ca)
        server=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server.load_cert_chain(identity/"server.pem",identity/"server.key")
        info=SimpleNamespace(server_address=(host,8766),phone_tls=server)
        manager=phone.PhoneLink();manager.server=info;manager.folder=identity;manager.url="https://"+host+":8766"
        def request(path, data=None, cookie="", origin=None):
            left,right=socket.socketpair()
            def serve():
                with left: app.PhoneHandler(left,("127.0.0.1",1),info)
            thread=threading.Thread(target=serve,daemon=True);thread.start()
            with client.wrap_socket(right,server_hostname=host) as conn:
                body=json.dumps(data).encode() if data is not None else b''
                req=(("POST" if data is not None else "GET")+f" {path} HTTP/1.0\r\nHost: {host}:8766\r\nOrigin: {origin or manager.url}\r\nContent-Type: application/json\r\nX-Cardfolio: local\r\nCookie: {cookie}\r\nContent-Length: {len(body)}\r\n\r\n").encode()
                conn.sendall(req+body)
                result=http.client.HTTPResponse(conn);result.begin()
                output=result.status,result.read(),result.getheader("Set-Cookie")
            thread.join(2)
            return output
        with patch.object(phone,"link",manager):
            self.assertEqual(request("/")[0],200)
            self.assertEqual(request("/api",dict(mode="live",action="state"))[0],401)
            code=manager.new_code()
            self.assertEqual(request("/pair",{"code":"incorrect"})[0],403)
            status,_,ticket=request("/pair",{"code":code});self.assertEqual(status,200)
            self.assertIn("HttpOnly",ticket);self.assertIn("Secure",ticket);self.assertIn("SameSite=Strict",ticket)
            self.assertEqual(request("/pair",{"code":code})[0],403)
            cookie=ticket.split(";")[0]
            status,body,_=request("/api",dict(mode="live",action="state"),cookie)
            self.assertEqual(status,200);state=json.loads(body)["state"];self.assertNotIn("phone",state);self.assertNotIn("snapshots",state)
            self.assertEqual(request("/api",dict(mode="live",action="phone-code"),cookie)[0],400)
            self.assertEqual(request("/api",dict(mode="live",action="state"),cookie,origin="https://example.invalid")[0],403)
            manager.control("phone-revoke",None)
            self.assertEqual(request("/api",dict(mode="live",action="state"),cookie)[0],401)
            code=manager.new_code();manager.deadline=0;self.assertIsNone(manager.pair(code))
            code=manager.new_code()
            for _ in range(10): self.assertIsNone(manager.pair("wrong"))
            self.assertIsNone(manager.pair(code))

if __name__=="__main__":
    unittest.main()
