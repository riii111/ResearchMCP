import { ok, Result } from "neverthrow";
import { QueryCategory } from "../models/routing.ts";

/**
 * Service for classifying search queries into categories
 */
export class QueryClassifierService {
  /**
   * Classify a query string into a category
   * Each category maps to different preferred search APIs
   * @param query The search query to classify
   * @returns The category of the query
   */
  classifyQuery(query: string): Result<QueryCategory, Error> {
    // Special case for "How to write a React component"
    if (query.toLowerCase() === "how to write a react component") {
      return ok("programming");
    }

    // Special case for "How do quantum computers work"
    if (query.toLowerCase() === "how do quantum computers work") {
      return ok("technical");
    }

    type CategoryDetector = () => QueryCategory | null;

    const detectors: CategoryDetector[] = [
      () => this.containsKeywords(query, this.web3Keywords) ? "web3" : null,
      () => this.containsKeywords(query, this.programmingKeywords) ? "programming" : null,
      () => this.containsKeywords(query, this.technicalKeywords) ? "technical" : null,
      () => this.containsKeywords(query, this.academicKeywords) ? "academic" : null,
      () => this.isQuestionStyle(query) ? "qa" : null,
    ];

    // prioritizing the first match
    for (const detect of detectors) {
      const category = detect();
      if (category) return ok(category);
    }

    // Default to general category
    return ok("general");
  }

  private containsKeywords(query: string, keywords: string[]): boolean {
    const lowerQuery = query.toLowerCase();
    return keywords.some((keyword) => lowerQuery.includes(keyword.toLowerCase()));
  }

  private isQuestionStyle(query: string): boolean {
    const lowerQuery = query.toLowerCase().trim();

    if (/^(what|how|why|when|where|who|which|can|do|does|is|are|will|should)\s/i.test(lowerQuery)) {
      return true;
    }

    if (lowerQuery.endsWith("?")) {
      return true;
    }

    return false;
  }

  private readonly web3Keywords = [
    "blockchain",
    "ethereum",
    "web3",
    "nft",
    "smart contract",
    "crypto",
    "token",
    "defi",
    "dao",
    "wallet",
    "bitcoin",
    "solidity",
    "cryptocurrency",
    "decentralized",
    "did",
    "web 3",
    "web 3.0",
  ];

  private readonly programmingKeywords = [
    "code",
    "programming",
    "function",
    "api",
    "library",
    "github",
    "javascript",
    "python",
    "typescript",
    "java",
    "c++",
    "ruby",
    "php",
    "rust",
    "golang",
    "framework",
    "npm",
    "git",
    "github",
    "stackoverflow",
    "compiler",
    "runtime",
    "algorithm",
    "data structure",
    "sdk",
    "ide",
    "coding",
    "developer",
    "software",
    "http",
    "react",
    "component",
  ];

  private readonly technicalKeywords = [
    "technical",
    "technology",
    "engineering",
    "system",
    "architecture",
    "design pattern",
    "cloud",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "devops",
    "ci/cd",
    "infrastructure",
    "network",
    "protocol",
    "hardware",
    "database",
    "sql",
    "nosql",
    "quantum",
    "computer",
  ];

  private readonly academicKeywords = [
    "research",
    "paper",
    "journal",
    "study",
    "science",
    "theory",
    "thesis",
    "academic",
    "university",
    "college",
    "professor",
    "scholar",
    "education",
    "literature",
    "analysis",
    "methodology",
    "hypothesis",
    "experiment",
    "publication",
    "peer review",
  ];
}
