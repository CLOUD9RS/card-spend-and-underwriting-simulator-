"""Opt-in, same-Wi-Fi HTTPS access. Pairing credentials are separate from the ledger."""
import base64
import hashlib
import ipaddress
import re
import secrets
import shutil
import sqlite3
import ssl
import subprocess
import tempfile
import threading
import time
from contextlib import closing
from http.cookies import SimpleCookie, CookieError
from pathlib import Path

import ledger

PORT = 8766
COOKIE = "__Host-cardfolio"
LIFETIME = 30 * 24 * 60 * 60
MAC_ACTIONS = {"phone-start","phone-stop","phone-code","phone-revoke","phone-cert"}
PHONE_ACTIONS = {
    "state","card","entry","budget","copy-budgets","recurring","remove-recurring",
    "skip-recurring","log-recurring","remove","review","profile","parse-report",
    "balance","remove-balance","holding","remove-holding","csv-preview","csv-post",
    "artwork","quotes"
}
RFC1918 = tuple(ipaddress.ip_network(cidr) for cidr in ("10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"))

def data_dir():
    path = ledger.ROOT / "PhoneAccess"
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path

def local_address():
    for interface in ("en0","en1","en2","en3","en4","en5"):
        ip = subprocess.run(["/usr/sbin/ipconfig","getifaddr",interface],capture_output=True,text=True).stdout.strip()
        try:
            address = ipaddress.IPv4Address(ip)
        except ValueError:
            continue
        if any(address in block for block in RFC1918):
            return str(address)
    raise ValueError("Connect the Mac to your private Wi-Fi network, then enable phone access again.")

def openssl(*args):
    exe = shutil.which("openssl") or "/usr/bin/openssl"
    result = subprocess.run([exe,*map(str,args)],stdin=subprocess.DEVNULL,capture_output=True,timeout=20)
    if result.returncode:
        raise ValueError("Could not prepare the local TLS certificate. Check that OpenSSL is available.")
    return result.stdout

def identity(ip):
    """Issue once per LAN address. Discard the signing key before enabling access."""
    ip = str(ipaddress.IPv4Address(ip))
    dest = data_dir() / ("identity-"+ip)
    public = dest / "Cardfolio.cer"
    if public.exists() and (dest/"server.pem").exists():
        try:
            openssl("x509","-in",dest/"server.pem","-checkend","86400","-noout")
            if (dest/"server.key").is_file(): return dest
        except (ValueError,OSError): pass
    dest.mkdir(mode=0o700,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=dest) as stage:
        p=Path(stage)
        root_ext="[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\nCN=Cardfolio local pairing\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n"
        (p/"root.conf").write_text(root_ext)
        (p/"leaf.conf").write_text("[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nauthorityKeyIdentifier=keyid,issuer\nsubjectAltName=IP:"+ip+"\n")
        openssl("req","-new","-x509","-newkey","rsa:2048","-sha256","-nodes","-days","390","-config",p/"root.conf","-keyout",p/"ca.key","-out",p/"ca.pem")
        openssl("req","-new","-newkey","rsa:2048","-sha256","-nodes","-subj","/CN=Cardfolio","-keyout",p/"server.key","-out",p/"leaf.csr")
        openssl("x509","-req","-in",p/"leaf.csr","-CA",p/"ca.pem","-CAkey",p/"ca.key","-CAcreateserial","-days","180","-sha256","-extfile",p/"leaf.conf","-extensions","server","-out",p/"server.pem")
        openssl("x509","-in",p/"ca.pem","-outform","DER","-out",p/"Cardfolio.cer")
        for filename in ("server.key","server.pem","Cardfolio.cer"):
            (p/filename).chmod(0o600)
            (p/filename).replace(dest/filename)
    return dest

class PhoneLink:
    def __init__(self):
        self.lock=threading.RLock()
        self.server=None
        self.code=""
        self.deadline=0
        self.attempts=0
        self.folder=None
        self.url=""

    def sessions(self):
        con=sqlite3.connect(data_dir()/"sessions.sqlite3",timeout=4)
        con.execute("CREATE TABLE IF NOT EXISTS devices(digest TEXT PRIMARY KEY,expires REAL NOT NULL)")
        return con

    def new_code(self):
        self.code=secrets.token_hex(6).upper()
        self.deadline=time.monotonic()+600
        self.attempts=0
        return self.code

    def pair(self, code):
        with self.lock:
            if not self.server or not self.code or self.deadline<time.monotonic() or self.attempts>=10:
                return None
            self.attempts+=1
            normalized = str(code).strip().replace("-","").upper()
            if not normalized.isascii() or not secrets.compare_digest(normalized,self.code):
                return None
            ticket=secrets.token_urlsafe(32)
            with closing(self.sessions()) as con, con:
                con.execute("DELETE FROM devices WHERE expires<=?",(time.time(),))
                con.execute("INSERT INTO devices VALUES(?,?)",(hashlib.sha256(ticket.encode()).hexdigest(),time.time()+LIFETIME))
            self.code=""
            return ticket

    def authorized(self, header):
        try:
            cookies=SimpleCookie()
            cookies.load(header or "")
            value=cookies[COOKIE].value
        except (KeyError,CookieError):
            return False
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}",value):
            return False
        with closing(self.sessions()) as con:
            return bool(con.execute("SELECT 1 FROM devices WHERE digest=? AND expires>?",
                  (hashlib.sha256(value.encode()).hexdigest(),time.time())).fetchone())

    def status(self):
        with self.lock:
            if not self.server:
                return {"enabled":False}
            cert=(self.folder/"Cardfolio.cer").read_bytes()
            return {"enabled":True,"url":self.url,"certificate":str(self.folder/"Cardfolio.cer"),
                    "fingerprint":hashlib.sha256(cert).hexdigest().upper()}

    def control(self,action,handler):
        with self.lock:
            if action=="phone-start" and not self.server:
                from http.server import ThreadingHTTPServer
                ip=local_address()
                folder=identity(ip)
                context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.minimum_version=ssl.TLSVersion.TLSv1_2
                context.load_cert_chain(folder/"server.pem",folder/"server.key")
                try:
                    server=ThreadingHTTPServer((ip,PORT),handler)
                except OSError as exc:
                    raise ValueError("Could not open phone access on this Wi-Fi address. Check port 8766 and macOS local-network access.") from exc
                # Do the handshake inside each worker so a slow client cannot block accept().
                server.phone_tls=context
                self.url=f"https://{ip}:{PORT}"
                self.folder=folder
                self.server=server
                threading.Thread(target=server.serve_forever,daemon=True).start()
            if action in {"phone-start","phone-code"}:
                if not self.server: raise ValueError("Enable phone access first.")
                return {**self.status(),"code":self.new_code()}
            if action=="phone-stop":
                if self.server:
                    self.server.shutdown()
                    self.server.server_close()
                    self.server=None
                self.code=""
            if action=="phone-revoke":
                with closing(self.sessions()) as con, con:
                    con.execute("DELETE FROM devices")
                self.code=""
            if action=="phone-cert" and self.server:
                return {"der":base64.b64encode((self.folder/"Cardfolio.cer").read_bytes()).decode()}
            return self.status()

link=PhoneLink()
