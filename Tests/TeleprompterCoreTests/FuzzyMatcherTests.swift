import Testing
@testable import TeleprompterCore

@Suite("FuzzyMatcher")
struct FuzzyMatcherTests {
    @Test func editDistanceBasics() {
        #expect(FuzzyMatcher.editDistance([], []) == 0)
        #expect(FuzzyMatcher.editDistance(["a"], []) == 1)
        #expect(FuzzyMatcher.editDistance([], ["a"]) == 1)
        #expect(FuzzyMatcher.editDistance(["a", "b", "c"], ["a", "b", "c"]) == 0)
        #expect(FuzzyMatcher.editDistance(["a", "b", "c"], ["a", "x", "c"]) == 1)
        #expect(FuzzyMatcher.editDistance(["a", "b", "c"], ["a", "b"]) == 1)
        #expect(FuzzyMatcher.editDistance(["a", "b"], ["a", "b", "c"]) == 1)
    }

    @Test func exactMatch() {
        let ref = ["hello", "world", "foo", "bar", "baz"]
        let tail = ["foo", "bar"]
        let align = FuzzyMatcher.bestAlignment(reference: ref, observedTail: tail, searchStart: 0, searchEnd: ref.count)
        #expect(align?.endIndex == 3)
        #expect(align?.score == 1.0)
    }

    @Test func singleSubstitution() {
        let ref = ["a", "b", "c", "d", "e"]
        let tail = ["b", "x"]
        let align = FuzzyMatcher.bestAlignment(reference: ref, observedTail: tail, searchStart: 0, searchEnd: ref.count)
        #expect(align?.endIndex == 2)
        if let s = align?.score {
            #expect(abs(s - 0.5) < 0.001)
        }
    }

    @Test func emptyInputsReturnNil() {
        #expect(FuzzyMatcher.bestAlignment(reference: [], observedTail: ["a"], searchStart: 0, searchEnd: 0) == nil)
        #expect(FuzzyMatcher.bestAlignment(reference: ["a"], observedTail: [], searchStart: 0, searchEnd: 1) == nil)
    }

    @Test func searchWindowBounds() {
        let ref = ["a", "b", "c", "d", "e", "f", "g"]
        let tail = ["b", "c"]
        let align = FuzzyMatcher.bestAlignment(reference: ref, observedTail: tail, searchStart: 3, searchEnd: 6)
        #expect(align != nil)
        #expect(align?.score != 1.0)
    }

    @Test func prefersExactMatchOverNearby() {
        let ref = ["a", "b", "c", "a", "b", "c"]
        let tail = ["a", "b", "c"]
        let align = FuzzyMatcher.bestAlignment(reference: ref, observedTail: tail, searchStart: 0, searchEnd: ref.count)
        #expect(align?.score == 1.0)
    }
}
