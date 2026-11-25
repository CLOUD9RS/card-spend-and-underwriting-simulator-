import Cocoa
import WebKit
import UniformTypeIdentifiers

final class Host: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let worker = Process()
    let input = Pipe(), output = Pipe()
    let queue = DispatchQueue(label: "Cardfolio.local-ledger")
    var buffer = Data()
    var root: URL { Bundle.main.resourceURL! }
    var page: URL { root.appendingPathComponent("static/index.html") }

    func applicationDidFinishLaunching(_ note: Notification) {
        if let running = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "local.cardfolio.desktop").first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            running.activate(options: [.activateAllWindows]); NSApp.terminate(nil); return
        }
        let menu = NSMenu(), item = NSMenuItem()
        menu.addItem(item)
        item.submenu = NSMenu()
        item.submenu?.addItem(withTitle: "Quit Cardfolio", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let edit = NSMenuItem(); menu.addItem(edit); edit.submenu = NSMenu(title: "Edit")
        for (title, selector, key) in [("Cut","cut:","x"),("Copy","copy:","c"),("Paste","paste:","v"),("Select All","selectAll:","a"),("Undo","undo:","z")] {
            edit.submenu?.addItem(withTitle:title,action:NSSelectorFromString(selector),keyEquivalent:key)
        }
        NSApp.mainMenu = menu
        let config = WKWebViewConfiguration()
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name:"cardfolio")
        web = WKWebView(frame:.zero, configuration:config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        window = NSWindow(contentRect:NSRect(x:0,y:0,width:1360,height:860),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="Cardfolio"; window.minSize=NSSize(width:420,height:520); window.contentView=web
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
        let paths = ["/Library/Frameworks/Python.framework/Versions/Current/bin/python3","/opt/homebrew/bin/python3","/usr/local/bin/python3","/usr/bin/python3"]
        worker.executableURL=URL(fileURLWithPath:paths.first(where:{FileManager.default.isExecutableFile(atPath:$0)}) ?? "/usr/bin/python3")
        worker.arguments=["-B",root.appendingPathComponent("app.py").path,"--stdio"]
        worker.standardInput=input; worker.standardOutput=output; worker.standardError=FileHandle.nullDevice
        do { try worker.run() } catch { NSAlert(error:error).runModal(); NSApp.terminate(nil); return }
        web.loadFileURL(page,allowingReadAccessTo:root.appendingPathComponent("static"))
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
    func applicationWillTerminate(_ note:Notification) { if worker.isRunning { worker.terminate() } }
    func webView(_ webView:WKWebView,decidePolicyFor action:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
        guard let url=action.request.url else { decisionHandler(.cancel); return }
        if url.isFileURL && url.standardizedFileURL.path == page.standardizedFileURL.path { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated && url.scheme=="https" && ["www.hdfc.bank.in","www.kotak811.bank.in","support.apple.com","www.cibil.com"].contains(url.host ?? "") { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView:WKWebView,runOpenPanelWith parameters:WKOpenPanelParameters,initiatedByFrame frame:WKFrameInfo,completionHandler:@escaping([URL]?)->Void) {
        let panel=NSOpenPanel(); panel.allowsMultipleSelection=false; panel.canChooseDirectories=false
        panel.allowedContentTypes=[.pdf,.plainText,.commaSeparatedText,.json,.jpeg,.png,.webP]
        panel.beginSheetModal(for:window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
    func userContentController(_ controller:WKUserContentController,didReceive msg:WKScriptMessage,replyHandler:@escaping(Any?,String?)->Void) {
        guard msg.frameInfo.isMainFrame, msg.frameInfo.request.url?.standardizedFileURL.path==page.standardizedFileURL.path,
              let request=msg.body as? [String:Any] else { replyHandler(nil,"Untrusted page"); return }
        if request["action"] as? String == "export-certificate", let encoded=request["der"] as? String, let data=Data(base64Encoded:encoded), data.count < 8192 {
            let panel=NSSavePanel(); panel.nameFieldStringValue="Cardfolio.cer"
            panel.beginSheetModal(for:window) { result in
                guard result == .OK, let url=panel.url else { replyHandler(["saved":false],nil); return }
                do { try data.write(to:url,options:.atomic); replyHandler(["saved":true],nil) }
                catch { replyHandler(nil,"Could not save certificate.") }
            }; return
        }
        if request["action"] as? String == "export", let csv=request["csv"] as? String {
            let panel=NSSavePanel(); panel.nameFieldStringValue="Cardfolio-transactions.csv"; panel.allowedContentTypes=[.commaSeparatedText]
            panel.beginSheetModal(for:window) { result in
                guard result == .OK, let url=panel.url else { replyHandler(["saved":false],nil); return }
                do { try csv.write(to:url,atomically:true,encoding:.utf8); replyHandler(["saved":true],nil) } catch { replyHandler(nil,"Could not save CSV.") }
            }; return
        }
        queue.async {
            do {
                var data=try JSONSerialization.data(withJSONObject:request); data.append(10)
                try self.input.fileHandleForWriting.write(contentsOf:data)
                while !self.buffer.contains(10) {
                    let next=self.output.fileHandleForReading.availableData
                    if next.isEmpty { throw NSError(domain:"Cardfolio",code:1) }
                    self.buffer.append(next)
                }
                let index=self.buffer.firstIndex(of:10)!
                let line=self.buffer.prefix(upTo:index)
                let result=try JSONSerialization.jsonObject(with:line)
                self.buffer.removeSubrange(...index)
                DispatchQueue.main.async { replyHandler(result,nil) }
            } catch { DispatchQueue.main.async { replyHandler(nil,"The local ledger stopped. Reopen Cardfolio.") } }
        }
    }
}
let application=NSApplication.shared
let host=Host()
application.setActivationPolicy(.regular)
application.delegate=host
application.run()
