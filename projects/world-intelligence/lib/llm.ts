/**
 * LLM provider abstraction — supports Anthropic, OpenAI, Azure OpenAI, and Gemini.
 * Implements fallback chain: on rate-limit (429) or server error (5xx), advances to next model.
 */

export interface FallbackModel {
  provider: string
  model: string
  apiKey: string
  baseURL?: string // for Azure OpenAI
  deploymentId?: string // for Azure OpenAI
}

export interface LLMConfig {
  provider: string
  model: string
  apiKey: string
  baseURL?: string
  deploymentId?: string
  fallbacks: FallbackModel[]
}

export interface LLMResult {
  text: string
  inputTokens: number
  outputTokens: number
}

// Price table: USD per 1M tokens (input, output)
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'o1': { input: 15.0, output: 60.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'o4-mini': { input: 1.1, output: 4.4 },
  // Gemini
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-3.1-flash-lite-preview': { input: 0.01, output: 0.04 },
  'gemini-2.5-flash-lite': { input: 0.02, output: 0.08 },
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-3.1-pro-preview': { input: 1.25, output: 5.00 },
  'gemini-3.1-flash-lite': { input: 0.01, output: 0.04 },
}

function isRetryableError(err: unknown): boolean {
  const status = (err as any)?.status
  return status === 429 || (status !== undefined && status >= 500 && status < 600)
}

async function callProvider(prompt: string, config: Pick<LLMConfig, 'provider' | 'model' | 'apiKey' | 'baseURL' | 'deploymentId'>): Promise<LLMResult> {
  const { provider, model, apiKey, baseURL, deploymentId } = config

  if (provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
    const textContent = response.content.find(c => c.type === 'text')
    return {
      text: textContent && 'text' in textContent ? textContent.text : '',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }
  }

  if (provider === 'openai' || provider === 'azure') {
    const OpenAI = (await import('openai')).default
    const clientConfig: any = { apiKey }
    if (baseURL) clientConfig.baseURL = baseURL
    const client = new OpenAI(clientConfig)
    const resolvedModel = provider === 'azure' ? (deploymentId || model) : model
    const response = await client.chat.completions.create({
      model: resolvedModel,
      messages: [{ role: 'user', content: prompt }],
    })
    return {
      text: response.choices[0]?.message?.content || '',
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    }
  }

  if (provider === 'gemini') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const client = new GoogleGenerativeAI(apiKey)
    const genModel = client.getGenerativeModel({ model })
    const response = await genModel.generateContent(prompt)
    return {
      text: response.response.text(),
      inputTokens: response.response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.response.usageMetadata?.candidatesTokenCount || 0,
    }
  }

  throw new Error(`Unknown provider: ${provider}`)
}

/**
 * Call LLM with automatic fallback chain on rate-limit or server error.
 */
export async function callLLM(prompt: string, config: LLMConfig): Promise<LLMResult> {
  const chain: Array<Pick<LLMConfig, 'provider' | 'model' | 'apiKey' | 'baseURL' | 'deploymentId'>> = [
    { provider: config.provider, model: config.model, apiKey: config.apiKey, baseURL: config.baseURL, deploymentId: config.deploymentId },
    ...config.fallbacks,
  ]

  let lastError: unknown
  for (const candidate of chain) {
    try {
      return await callProvider(prompt, candidate)
    } catch (err) {
      lastError = err
      if (!isRetryableError(err)) {
        throw err
      }
      // Log and advance to next fallback
      console.warn(`[llm] ${candidate.provider}/${candidate.model} failed (status ${(err as any)?.status}), trying next fallback`)
    }
  }

  throw lastError
}

/**
 * Estimate cost in USD for a given number of tokens.
 */
export function estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const prices = PRICE_TABLE[model]
  if (!prices) return 0
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000
}
