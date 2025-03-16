import { ok, Result } from "neverthrow";
import { QueryCategory } from "../models/routing.ts";

/**
 * Service for classifying search queries into categories
 */
export class QueryClassifierService {
  /**
   * Classify a query string into a category
   * @param query The search query to classify
   * @returns The category of the query
   */
  classifyQuery(query: string): Result<QueryCategory, Error> {
    // Web3 related keywords
    if (this.containsKeywords(query, this.web3Keywords)) {
      return ok("web3");
    }
    
    // Programming and development related
    if (this.containsKeywords(query, this.programmingKeywords)) {
      return ok("programming");
    }
    
    // Technical and science related
    if (this.containsKeywords(query, this.technicalKeywords)) {
      return ok("technical");
    }
    
    // Academic and research related
    if (this.containsKeywords(query, this.academicKeywords)) {
      return ok("academic");
    }
    
    // Question and answer style queries
    if (this.isQuestionStyle(query)) {
      return ok("qa");
    }
    
    // Default category is general search
    return ok("general");
  }
  
  /**
   * Check if the query contains any of the given keywords
   */
  private containsKeywords(query: string, keywords: string[]): boolean {
    const lowerQuery = query.toLowerCase();
    return keywords.some(keyword => lowerQuery.includes(keyword.toLowerCase()));
  }
  
  /**
   * Check if the query is in question format
   */
  private isQuestionStyle(query: string): boolean {
    const lowerQuery = query.toLowerCase().trim();
    
    // Questions starting with question words
    if (/^(what|how|why|when|where|who|which|can|do|does|is|are|will|should)\s/i.test(lowerQuery)) {
      return true;
    }
    
    // Questions ending with question mark
    if (lowerQuery.endsWith("?")) {
      return true;
    }
    
    return false;
  }
  
  // Keywords for different categories
  private readonly web3Keywords = [
    "blockchain", "ethereum", "web3", "nft", "smart contract", "crypto", 
    "token", "defi", "dao", "wallet", "bitcoin", "solidity", "cryptocurrency",
    "decentralized", "did", "web 3", "web 3.0"
  ];
  
  private readonly programmingKeywords = [
    "code", "programming", "function", "api", "library", "github", "javascript",
    "python", "typescript", "java", "c++", "ruby", "php", "rust", "golang", "framework",
    "npm", "git", "github", "stackoverflow", "compiler", "runtime", "algorithm",
    "data structure", "sdk", "ide", "coding", "developer", "software", "http"
  ];
  
  private readonly technicalKeywords = [
    "technical", "technology", "engineering", "system", "architecture", "design pattern",
    "cloud", "aws", "azure", "gcp", "docker", "kubernetes", "devops", "ci/cd",
    "infrastructure", "network", "protocol", "hardware", "database", "sql", "nosql"
  ];
  
  private readonly academicKeywords = [
    "research", "paper", "journal", "study", "science", "theory", "thesis", "academic",
    "university", "college", "professor", "scholar", "education", "literature", 
    "analysis", "methodology", "hypothesis", "experiment", "publication", "peer review"
  ];
}