export interface RerankRequest {
  model: string;
  query: string;
  documents: string[];
  top_n?: number;
  return_documents?: boolean;
  max_chunks_per_doc?: number;
  overlap?: number;
}

export interface RerankResult {
  index: number;
  relevance_score: number;
  document?: {
    text: string;
  };
}

export interface RerankResponse {
  id: string;
  results: RerankResult[];
  meta?: {
    api_version?: {
      version: string;
    };
    billed_units?: {
      search_units?: number;
    };
    tokens?: {
      input_tokens?: number;
    };
  };
}

export interface RerankErrorResponse {
  error?: {
    message: string;
    type?: string;
    code?: string;
  };
}

export interface RerankedDocument<T = unknown> {
  originalIndex: number;
  score: number;
  text: string;
  data?: T;
}

export interface RerankOptions {
  topN?: number;
  maxChunksPerDoc?: number;
  chunkOverlap?: number;
  retries?: number;
}
