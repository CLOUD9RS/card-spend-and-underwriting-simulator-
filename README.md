# Cardfolio

Cardfolio is a personal finance dashboard hosted on your Mac. It keeps a SQLite ledger of your spending, card rewards, balances and equity holdings. A separate demo workspace contains fictional data.

## Open on your Mac

Use Python 3.9 or newer. The browser version uses the Python standard library. Building the desktop app requires Xcode Command Line Tools on macOS.

```sh
python3 scripts/fetch_artwork.py
./build-mac.sh
open build/Cardfolio.app
```

The artwork command is optional. It downloads two pinned public product illustrations and verifies their checksums. See [ARTWORK.md](ARTWORK.md) for the sources and pictured card variants. You can replace a sample in **My cards → Artwork** with a redacted image of your edition.

For subsequent launches, open **Cardfolio.app** or double-click **Open-Cardfolio.command**. To use the browser interface instead, run the following command from the project folder and open [the local dashboard](http://127.0.0.1:8765/).

```sh
python3 app.py
```

Choose **My portfolio** to start your own ledger. Open **My cards** to set card names, statement days, value per point and the last four digits used for matching alerts.

## Use from an iPhone

1. Connect the iPhone and Mac to the same private Wi-Fi. On the Mac, open **Settings → Enable phone access**. Keep this app instance open and the Mac awake.
2. Select **Save public certificate**. AirDrop the resulting `Cardfolio.cer` to the iPhone. Install the downloaded profile, then enable the Cardfolio root under **Settings → General → About → Certificate Trust Settings**. The Mac displays the certificate fingerprint for comparison.
3. Open the displayed HTTPS address in Safari and enter the single-use code. A code is valid for ten minutes. Use **Pair a phone** on the Mac for a fresh one.
4. For regular use, select **Share → Add to Home Screen** in Safari. Safari may ask you to pair the Home Screen app separately.

Phone access starts off. Enabling it binds HTTPS to one private IPv4 interface on port 8766. The temporary certificate-signing key is discarded after the host certificate is issued. A paired device can read and edit the ledger for up to 30 days. **Turn off** stops the listener. **Forget paired devices** revokes saved sessions. Changes of LAN address or certificate expiry can require installing the new public certificate. Remove obsolete Cardfolio profiles in iPhone Settings. [Apple certificate trust instructions](https://support.apple.com/102390)

## Spending and rewards

- Record card, cash, debit and bank UPI purchases and refunds. Track monthly budgets, recurring bills and statement cycles.
- Search transactions across months, filter by source or category, and export the filtered results.
- Import UTF-8 CSV statements with Date, Merchant, Payment method and Amount columns. Use ISO dates. Category and Type are optional. Preview checks matching entries and lists invalid rows before the import transaction.
- Compare estimated base points, statement overrides and confirmed cashback. Reward values depend on your chosen valuation and the issuer’s actual posting.
- Use the credit report simulator for editable what-if scenarios. The percentage is the share of illustrative policies passed. The simulator has no lender outcome calibration.

## Bank alerts and balances

Configure **Connections** on the Mac. Apple Mail must have the alert mailbox in its inbox, and bank SMS must already be visible in Messages on the Mac. Mail automation and Messages access require macOS permissions. Home Screen access uses the Mac’s import process.

Supported HDFC and Kotak alerts are checked while the host runs. Purchases match by issuer and last four digits. Ambiguous alerts go to review. OTPs and unsupported formats are skipped. For automatic savings balance updates, save the issuer and last four digits in **Net worth**. A newer matching alert must explicitly report an available or closing balance. Savings balances can also be updated manually. Alerts may omit transactions or balances, so use statements for reconciliation.

## Stocks and net worth

Enter NSE or BSE holdings in INR with quantity and average buy price. For a local manual valuation, enter the price and its date. For market quotes, enter the exchange and ISIN and connect a read-only Upstox Analytics Token in **My portfolio → Investments** on the Mac. **Refresh prices** requests last traded prices and previous closes. The application sends instrument identifiers to Upstox. Quantities, cost basis and bank balances stay in the ledger. A token entered in the UI lives in memory for that host process. An environment-supplied `UPSTOX_ANALYTICS_TOKEN` is also supported. [Upstox LTP API](https://upstox.com/developer/api-documentation/ltp-v3/)

Net worth is recorded assets plus equity value less recorded liabilities. A holding without a market price is carried at cost and flagged. Gains are unrealised, before fees and taxes. Record current card dues or loans as liabilities, and count each deposit only once.

## Local storage and recovery

The default data directory is `~/Library/Application Support/Cardfolio/`. Set `CARDFOLIO_DATA` to choose another local directory. The personal and demo ledgers have separate database files. Local snapshots include the selected workspace’s financial records and any uploaded card artwork. Restoring creates a snapshot of the current ledger first and pauses alert connections. Keep a copy of valued backups on a separate drive.

Database and backup contents use the Mac’s filesystem protections. They do not have a separate application encryption passphrase. Phone session credentials and TLS keys are outside the ledger backups.

## Verification

```sh
python3 -m unittest discover -s tests -v
node tests/ui-smoke.cjs
```

The tests use temporary ledgers, sample alerts and a simulated market response. The phone test performs a certificate-verified TLS handshake and sends HTTP requests over a local socket pair. The UI smoke test runs the page renderers against the real Python backend. Testing physical iPhone pairing, live bank imports and a live market-data entitlement requires the corresponding devices, permissions and token.
