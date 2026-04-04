import type { RerankerConfig } from '../../config.js';
import type { RerankErrorResponse, RerankRequest, RerankResponse } from './types.js';

export async function requestRerank(
  config: RerankerConfig,
  requestBody: RerankRequest,
): Promise<RerankResponse> {
  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const data = (await response.json()) as RerankResponse & RerankErrorResponse;

  if (!response.ok || data.error) {
    const errorMsg = data.error?.message || `HTTP ${response.status}`;
    throw new Error(`Rerank API 错误: ${errorMsg}`);
  }

  return data;
}
