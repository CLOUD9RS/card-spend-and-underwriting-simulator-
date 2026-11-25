import Foundation
import PDFKit
guard let input = try? JSONSerialization.jsonObject(with: FileHandle.standardInput.readDataToEndOfFile()) as? [String:String],
      let data=Data(base64Encoded:input["content"] ?? ""), let pdf=PDFDocument(data:data) else { exit(2) }
if pdf.isLocked && !pdf.unlock(withPassword:input["password"] ?? "") { exit(3) }
guard pdf.pageCount <= 400 else { exit(2) }
var remaining = 1_000_000
for n in 0..<pdf.pageCount {
    let text=String((pdf.page(at:n)?.string ?? "").prefix(remaining))
    print(text); remaining -= text.count
    if remaining == 0 { break }
}
