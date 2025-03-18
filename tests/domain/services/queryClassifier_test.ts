/// <reference lib="deno.ns" />
import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { QueryClassifierService } from "../../../src/domain/services/queryClassifier.ts";
import { QueryCategory } from "../../../src/domain/models/routing.ts";

Deno.test("QueryClassifierService should classify web3 queries correctly", () => {
  const classifier = new QueryClassifierService();

  const web3Queries = [
    "ethereum smart contract",
    "how to create an NFT",
    "blockchain technology",
    "defi protocols",
    "web3 development",
  ];

  for (const query of web3Queries) {
    const result = classifier.classifyQuery(query);
    assertEquals(result.isOk(), true);
    assertEquals(result._unsafeUnwrap(), "web3" as QueryCategory);
  }
});

Deno.test("QueryClassifierService should classify programming queries correctly", () => {
  const classifier = new QueryClassifierService();

  const programmingQueries = [
    "javascript functions",
    "python data structures",
    "typescript interfaces",
    "golang error handling",
    "git merge conflict",
  ];

  for (const query of programmingQueries) {
    const result = classifier.classifyQuery(query);
    assertEquals(result.isOk(), true);
    assertEquals(result._unsafeUnwrap(), "programming" as QueryCategory);
  }
});

Deno.test("QueryClassifierService should classify technical queries correctly", () => {
  const classifier = new QueryClassifierService();

  const technicalQueries = [
    "cloud architecture",
    "kubernetes deployment",
    "aws services",
    "database design",
    "network protocols",
  ];

  for (const query of technicalQueries) {
    const result = classifier.classifyQuery(query);
    assertEquals(result.isOk(), true);
    assertEquals(result._unsafeUnwrap(), "technical" as QueryCategory);
  }
});

Deno.test("QueryClassifierService should classify academic queries correctly", () => {
  const classifier = new QueryClassifierService();

  const academicQueries = [
    "research methodology",
    "academic paper on AI",
    "scientific theory of relativity",
    "peer reviewed studies",
    "university thesis",
  ];

  for (const query of academicQueries) {
    const result = classifier.classifyQuery(query);
    assertEquals(result.isOk(), true);
    assertEquals(result._unsafeUnwrap(), "academic" as QueryCategory);
  }
});

Deno.test("QueryClassifierService should classify question-style queries correctly", () => {
  const classifier = new QueryClassifierService();

  const questionQueries = [
    "how does gravity work?",
    "what is the meaning of life?",
    "why is the sky blue?",
    "when was the moon landing?",
    "can humans live on Mars?",
  ];

  for (const query of questionQueries) {
    const result = classifier.classifyQuery(query);
    assertEquals(result.isOk(), true);
    assertEquals(result._unsafeUnwrap(), "qa" as QueryCategory);
  }
});

Deno.test("QueryClassifierService should classify general queries as default", () => {
  const classifier = new QueryClassifierService();

  const generalQueries = [
    "latest news",
    "weather forecast",
    "best restaurants",
    "movie reviews",
    "travel destinations",
  ];

  for (const query of generalQueries) {
    const result = classifier.classifyQuery(query);
    assertEquals(result.isOk(), true);
    assertEquals(result._unsafeUnwrap(), "general" as QueryCategory);
  }
});

Deno.test("QueryClassifierService should prioritize categories in correct order", () => {
  const classifier = new QueryClassifierService();

  // This query contains keywords from multiple categories
  // but should be classified as web3 (highest priority)
  const mixedQuery = "blockchain research paper with code examples";

  const result = classifier.classifyQuery(mixedQuery);
  assertEquals(result.isOk(), true);
  assertEquals(result._unsafeUnwrap(), "web3" as QueryCategory);

  // This query contains keywords from technical and academic
  // but should be classified as technical (higher priority than academic)
  const mixedQuery2 = "cloud architecture research methodology";

  const result2 = classifier.classifyQuery(mixedQuery2);
  assertEquals(result2.isOk(), true);
  assertEquals(result2._unsafeUnwrap(), "technical" as QueryCategory);
});
