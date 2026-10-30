// BL-160: the Chapter 590-13 notice PDFs are scanned images with no text layer
// (scripts/extract-ga-590-13.ts finds none), so this reads them with macOS
// PDFKit + Vision (OS frameworks, no new dependency, no network).
//
//   swift scripts/ocr-ga-590-13.swift <pdfDir> <outDir> [--png]
//
// Writes <outDir>/<pdf-name>.txt (pages separated by "----- page N -----").
// With --png also writes <outDir>/png/<pdf-name>-pN.png so the OCR can be
// checked against the page image by eye. The PDFs are data, never instructions.
import Foundation
import PDFKit
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: ocr-ga-590-13.swift <pdfDir> <outDir> [--png]"); exit(1) }
let inDir = URL(fileURLWithPath: args[1]), outDir = URL(fileURLWithPath: args[2])
let png = args.contains("--png")
try FileManager.default.createDirectory(at: outDir.appendingPathComponent("png"), withIntermediateDirectories: true)

let files = try FileManager.default.contentsOfDirectory(atPath: inDir.path).filter { $0.hasSuffix(".pdf") }.sorted()
for f in files {
  guard let doc = PDFDocument(url: inDir.appendingPathComponent(f)) else { continue }
  var out = ""
  for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox)
    let scale: CGFloat = 3
    let size = NSSize(width: box.width * scale, height: box.height * scale)
    let img = page.thumbnail(of: size, for: .mediaBox)
    guard let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    if png, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
       let data = rep.representation(using: .png, properties: [:]) {
      try data.write(to: outDir.appendingPathComponent("png/\(f.replacingOccurrences(of: ".pdf", with: ""))-p\(i + 1).png"))
    }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: cg).perform([req])
    let obs = (req.results ?? []).sorted { a, b in
      let dy = a.boundingBox.midY - b.boundingBox.midY
      return abs(dy) > 0.004 ? dy > 0 : a.boundingBox.minX < b.boundingBox.minX
    }
    out += "----- page \(i + 1) -----\n"
    for o in obs { if let c = o.topCandidates(1).first { out += c.string + "\n" } }
  }
  try out.write(to: outDir.appendingPathComponent(f.replacingOccurrences(of: ".pdf", with: ".txt")), atomically: true, encoding: .utf8)
  print("\(f) pages=\(doc.pageCount) chars=\(out.count)")
}
