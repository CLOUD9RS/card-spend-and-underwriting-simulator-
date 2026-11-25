// Executed by macOS JXA. Only bank-originated inbox messages in the time window leave Mail.
function run(argv) {
  const mail = Application("Mail");
  if (!mail.accounts().length) throw Error("No account configured in Apple Mail");
  const domains = ["hdfcbank.net","hdfcbank.com","hdfc.bank.in","kotak.com","kotak.bank.in","kotak811.bank.in"];
  const rows = mail.inbox.messages.whose({_and:[
    {dateReceived:{_greaterThan:new Date(Number(argv[0])*1000)}},
    {_or:domains.map(domain => ({sender:{_contains:domain}}))}
  ]})();
  const result = [];
  for (const m of rows) {
    const sender = m.sender();
    const address = (sender.match(/<([^<>]+)>\s*$/)||[null,sender])[1].trim().toLowerCase();
    const host = address.split("@").pop();
    if (!domains.some(d=>host===d || host.endsWith("."+d))) continue;
    const subject = m.subject() || "";
    if (/\botp\b|one.time password/i.test(subject)) continue;
    result.push({key:m.messageId() || String(m.id()),sender:address,stamp:m.dateReceived().getTime()/1000,
      text:subject+"\n"+String(m.content() || "").slice(0,14000)});
  }
  return JSON.stringify(result);
}
