import Testing
import Foundation
@testable import TeleprompterCore

@Suite("LLMConfig")
struct LLMConfigTests {
    @Test func chatCompletionsURLAppendsV1() {
        let cfg = LLMConfig(baseURL: URL(string: "https://api.openai.com")!, apiKey: "k")
        #expect(cfg.chatCompletionsURL.absoluteString == "https://api.openai.com/v1/chat/completions")
    }

    @Test func chatCompletionsURLRespectsExistingV1() {
        let cfg = LLMConfig(baseURL: URL(string: "https://proxy.example.com/v1")!, apiKey: "k")
        #expect(cfg.chatCompletionsURL.absoluteString == "https://proxy.example.com/v1/chat/completions")
    }

    @Test func chatCompletionsURLTrimsTrailingSlash() {
        let cfg = LLMConfig(baseURL: URL(string: "https://api.openai.com/v1/")!, apiKey: "k")
        #expect(cfg.chatCompletionsURL.absoluteString == "https://api.openai.com/v1/chat/completions")
    }
}

@Suite("SSEStreamParser")
struct SSEStreamParserTests {
    @Test func parsesSingleDataEvent() {
        let parser = SSEStreamParser()
        let events = parser.append("data: {\"foo\":1}\n\n")
        #expect(events == [.data("{\"foo\":1}")])
    }

    @Test func parsesDoneSentinel() {
        let parser = SSEStreamParser()
        let events = parser.append("data: [DONE]\n\n")
        #expect(events == [.done])
    }

    @Test func handlesChunkedArrival() {
        let parser = SSEStreamParser()
        var events = parser.append("data: par")
        #expect(events.isEmpty)
        events = parser.append("t1\n\ndata: part2\n\n")
        #expect(events == [.data("part1"), .data("part2")])
    }

    @Test func skipsCommentsAndEmpty() {
        let parser = SSEStreamParser()
        let events = parser.append(": keepalive\n\ndata: hi\n\n")
        #expect(events == [.data("hi")])
    }

    @Test func handlesCRLF() {
        let parser = SSEStreamParser()
        let events = parser.append("data: hello\r\n\r\n")
        #expect(events == [.data("hello")])
    }
}

@Suite("LLMClient delta extraction")
struct LLMDeltaExtractionTests {
    @Test func extractsStreamingDelta() {
        let json = #"{"id":"abc","choices":[{"delta":{"content":"hello"}}]}"#
        #expect(LLMClient.extractDelta(from: json) == "hello")
    }

    @Test func extractsNonStreamingContent() {
        let json = #"{"choices":[{"message":{"content":"world"}}]}"#
        #expect(LLMClient.extractDelta(from: json) == "world")
    }

    @Test func returnsNilOnMalformed() {
        #expect(LLMClient.extractDelta(from: "not json") == nil)
        #expect(LLMClient.extractDelta(from: #"{"choices":[]}"#) == nil)
    }

    @Test func deltaWithoutContent() {
        // finish_reason 消息可能没有 content
        let json = #"{"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}"#
        #expect(LLMClient.extractDelta(from: json) == nil)
    }
}

@Suite("LLMClient network", .serialized)
struct LLMClientNetworkTests {
    @Test func streamsDeltasFromMockResponse() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockSSEURLProtocol.self]
        let session = URLSession(configuration: config)

        MockSSEURLProtocol.handler = { _ in
            let body = [
                "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\n",
                "data: {\"choices\":[{\"delta\":{\"content\":\"世界\"}}]}\n\n",
                "data: [DONE]\n\n",
            ].joined()
            let response = HTTPURLResponse(
                url: URL(string: "https://example.com/v1/chat/completions")!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "text/event-stream"]
            )!
            return (response, Data(body.utf8))
        }

        let cfg = LLMConfig(baseURL: URL(string: "https://example.com")!, apiKey: "k")
        let client = LLMClient(config: cfg, session: session)

        var deltas: [String] = []
        for try await chunk in client.stream(userPrompt: "hi") {
            deltas.append(chunk)
        }
        #expect(deltas == ["你好", "世界"])
    }

    @Test func surfacesHTTPError() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockSSEURLProtocol.self]
        let session = URLSession(configuration: config)

        MockSSEURLProtocol.handler = { _ in
            let response = HTTPURLResponse(
                url: URL(string: "https://example.com/v1/chat/completions")!,
                statusCode: 401,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (response, Data(#"{"error":"invalid_api_key"}"#.utf8))
        }

        let cfg = LLMConfig(baseURL: URL(string: "https://example.com")!, apiKey: "bad")
        let client = LLMClient(config: cfg, session: session)

        var caught: Error?
        do {
            for try await _ in client.stream(userPrompt: "hi") {}
        } catch {
            caught = error
        }
        guard case .httpStatus(let code, _)? = caught as? LLMError else {
            Issue.record("Expected LLMError.httpStatus, got \(String(describing: caught))")
            return
        }
        #expect(code == 401)
    }
}

/// URLProtocol mock：HTTP 请求被拦截，由 `handler` 合成响应。
final class MockSSEURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: (@Sendable (URLRequest) -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        let (response, data) = handler(request)
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
