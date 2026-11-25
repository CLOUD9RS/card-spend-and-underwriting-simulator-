"""Install two pinned sample card illustrations for local use."""
from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import urlopen

TARGET = Path(__file__).resolve().parents[1] / "static"
FILES = (
    ("regalia-gold-mastercard.png", "https://raw.githubusercontent.com/sanchit-borikar/WalletWise/947d5f964abe6885bbbdb9dbdf8d7ac1cbd1301e/cards%20picture/facie-regalia-gold.png",
     "30ac509fb66b88c23c0f3d56a4153960c79f57ff5bc9c202b4b754dc9c838761"),
    ("dream-different.webp", "https://raw.githubusercontent.com/Shubham-sharma8/cards/6cb758193bc374cca070f9bfbb9f16f54b2fe93d/data/assets/card_images/kotak-mahindra-bank/kotak-dream-different-credit-card.webp",
     "8e2ebe9dafc9421e33cccebd8ccd08795fdb9398cb1350081982928d84df33c5"),
)

def main():
    for filename, url, expected in FILES:
        dest = TARGET / filename
        if dest.exists() and sha256(dest.read_bytes()).hexdigest()==expected:
            print(f"{filename} verified")
            continue
        with urlopen(url,timeout=20) as response:
            data=response.read(1_000_001)
        if sha256(data).hexdigest()!=expected:
            raise SystemExit(f"Unexpected image contents for {filename}.")
        with NamedTemporaryFile(dir=TARGET,delete=False) as out:
            out.write(data)
        Path(out.name).replace(dest)
        print(f"Installed {filename}")

if __name__ == "__main__":
    main()
