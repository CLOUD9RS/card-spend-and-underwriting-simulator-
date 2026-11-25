"""Consistent, workspace-scoped local snapshots. All operations run on device."""
from datetime import datetime
import re
import sqlite3
import uuid

import ledger
from ledger import db, IST, guard, option

SNAPSHOT = re.compile(r"^\d{8}-\d{6}-[a-f0-9]{8}\.sqlite3$")

def folder(mode):
    option(mode, ["demo", "live"])
    return ledger.ROOT / "Backups" / mode

def list_backups(mode):
    directory = folder(mode)
    if not directory.is_dir():
        return []
    return [{"file": p.name, "size": p.stat().st_size,
             "created": datetime.fromtimestamp(p.stat().st_mtime, IST).isoformat()}
            for p in sorted(directory.iterdir(), reverse=True)
            if SNAPSHOT.fullmatch(p.name) and p.is_file() and not p.is_symlink()]

def snapshot(mode):
    directory = folder(mode)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    filename = datetime.now(IST).strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:8] + ".sqlite3"
    target = directory / filename
    temp = target.with_suffix(".partial")
    try:
        with db(mode) as source:
            out = sqlite3.connect(temp)
            try:
                source.backup(out)
                if out.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise ValueError("The snapshot could not be verified.")
            finally:
                out.close()
        temp.chmod(0o600)
        temp.rename(target)
    finally:
        temp.unlink(missing_ok=True)
    return filename

def restore(mode, name):
    if not isinstance(name, str) or not SNAPSHOT.fullmatch(name):
        raise ValueError("Select a snapshot from this workspace.")
    path = folder(mode) / name
    if path.is_symlink() or not path.is_file():
        raise ValueError("This snapshot is unavailable.")
    # Keep the current state before the SQLite online backup replaces it.
    source = sqlite3.connect(path.as_uri()+"?mode=ro", uri=True)
    try:
        with guard(mode,exclusive=True):
            required={"meta","cards","entries","sources","alerts","budgets","recurring","wealth_accounts","positions"}
            tables={row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if (not required.issubset(tables) or source.execute("PRAGMA quick_check").fetchone()[0] != "ok"
                    or source.execute("PRAGMA foreign_key_check").fetchone() is not None
                    or not source.execute("SELECT 1 FROM meta WHERE k='initialized'").fetchone()):
                raise ValueError("The snapshot failed validation.")
            snapshot(mode)
            with db(mode) as destination:
                source.backup(destination)
                destination.execute("UPDATE sources SET enabled=0,error=''")
    finally:
        source.close()
