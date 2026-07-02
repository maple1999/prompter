import PDFKit

public enum ResumeParseError: Error, LocalizedError {
    case fileNotFound
    case invalidPDF
    case noTextContent

    public var errorDescription: String? {
        switch self {
        case .fileNotFound:  return "文件不存在"
        case .invalidPDF:    return "无法读取 PDF 文件"
        case .noTextContent: return "PDF 中未提取到文本内容（可能是纯图片简历）"
        }
    }
}

/// 从 PDF 文件中提取纯文本。使用系统 PDFKit，无需第三方依赖。
enum ResumeParser {

    /// 从指定 URL 的 PDF 文件提取全部文本。
    /// - Parameter url: PDF 文件路径
    /// - Returns: 提取的纯文本
    static func extractText(from url: URL) throws -> String {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw ResumeParseError.fileNotFound
        }
        guard let document = PDFDocument(url: url) else {
            throw ResumeParseError.invalidPDF
        }

        var pages: [String] = []
        for i in 0..<document.pageCount {
            if let page = document.page(at: i), let text = page.string {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    pages.append(trimmed)
                }
            }
        }

        let result = pages.joined(separator: "\n\n")
        guard !result.isEmpty else {
            throw ResumeParseError.noTextContent
        }
        return result
    }
}
