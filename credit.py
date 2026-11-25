"""Extract only explicitly labelled aggregate metrics. Raw reports never enter SQLite."""
import base64
import json
import math
import re
import subprocess
from pathlib import Path
FIELDS={"score":(300,900),"util":(0,1000),"enquiries":(0,1000),"late":(0,1000),"ageMonths":(0,1200),"limit":(0,1000000000),"spend":(0,1000000000)}
PATTERNS={"score":r"(?:TransUnion\s+)?(?:CIBIL|Experian|CRIF|credit|bureau)\s*score(?:\s*2\.0)?","util":r"(?:credit\s+)?utili[sz]ation(?:\s+(?:ratio|percentage))?","enquiries":r"(?:hard\s+)?(?:enquir(?:y|ies)|inquir(?:y|ies))\s*(?:in\s+(?:the\s+)?)?(?:last|past)?\s*6\s*months","late":r"(?:late|missed)\s+payments?\s*(?:in\s+(?:the\s+)?)?(?:last|past)?\s*12\s*months","ageMonths":r"(?:oldest account|credit history)(?:\s+age)?\s*\(?months\)?","limit":r"(?:current|existing)\s+HDFC\s+(?:card\s+)?limit","spend":r"HDFC\s+(?:card\s+)?spend\s*(?:in\s+)?(?:last\s+)?6\s*months"}
def clean(values):
    if not isinstance(values,dict): raise ValueError("Use a JSON object with numeric profile fields.")
    result={}
    for key,(lo,hi) in FIELDS.items():
        val=values.get(key)
        if val is None or val=="": continue
        try: n=float(str(val).replace(",",""))
        except ValueError: raise ValueError("Check the numeric profile fields.") from None
        if not math.isfinite(n) or not lo<=n<=hi or (key in {"score","enquiries","late","ageMonths"} and not n.is_integer()): raise ValueError("A profile value is outside the supported range.")
        result[key]=n
    return result

def parse_report(data):
    try: raw=base64.b64decode(data.get("content",""),validate=True)
    except (ValueError,TypeError): raise ValueError("Could not read this file.") from None
    if not raw or len(raw)>8*1024*1024: raise ValueError("Choose a report under 8 MB.")
    ext=str(data.get("ext","")).lower()
    if ext=="pdf":
        root=Path(__file__).resolve().parent
        helper=next((p for p in (root/"report-reader",root/"build/report-reader") if p.is_file()),None)
        cmd=[str(helper)] if helper else ["/usr/bin/swift",str(root/"macos/ReportReader.swift")]
        try:
            proc=subprocess.run(cmd,input=json.dumps({"content":data["content"],"password":str(data.get("password",""))[:200]}).encode(),capture_output=True,timeout=50)
        except (OSError,subprocess.TimeoutExpired): raise ValueError("PDF extraction is unavailable. Use a text export or enter the figures manually.") from None
        if proc.returncode==3: raise ValueError("This PDF is locked. Enter its password and import again.")
        if proc.returncode: raise ValueError("Could not read PDF text. Use a text export or enter the figures manually.")
        text=proc.stdout.decode("utf-8","replace")[:1000000]
    elif ext in {"txt","csv","json"}:
        text=raw.decode("utf-8-sig","replace")
    else: raise ValueError("Choose a PDF, UTF-8 text, CSV or JSON report.")
    if ext=="json":
        try: return clean(json.loads(text))
        except json.JSONDecodeError: raise ValueError("The JSON file is invalid.") from None
    result={}
    for key,pattern in PATTERNS.items():
        matches=re.finditer(r"\b(?:"+pattern+r")\s*[:=,;|–-]?\s*(?:₹|INR|Rs\.?)?\s*([0-9]+(?:,[0-9]{2,3})*(?:\.\d+)?)\b",text,re.I)
        found=[m[1] for m in matches if not re.match(r"\s*(?:[-–—]|to)\s*\d",text[m.end():],re.I)]
        values=set(found)
        if len(values)==1:
            try: result.update(clean({key:found[0]}))
            except ValueError: pass
    return result
