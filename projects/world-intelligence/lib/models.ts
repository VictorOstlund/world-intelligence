/**
 * Single source of truth for provider model lists.
 * Anti-pattern: no hardcoded model lists in multiple places.
 */

export interface ModelOption {
  value: string
  label: string
  disabled?: boolean
}

export const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (balanced)' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (powerful)' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast)' },
    { value: 'gpt-4o', label: 'GPT-4o (balanced)' },
    { value: 'o3-mini', label: 'o3 Mini (reasoning/fast)' },
    { value: 'o4-mini', label: 'o4 Mini (reasoning/balanced)' },
    { value: 'o3', label: 'o3 (reasoning/powerful)' },
  ],
  azure: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast)' },
    { value: 'gpt-4o', label: 'GPT-4o (balanced)' },
    { value: 'o3-mini', label: 'o3 Mini (reasoning/fast)' },
    { value: 'o4-mini', label: 'o4 Mini (reasoning/balanced)' },
    { value: 'o3', label: 'o3 (reasoning/powerful)' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (fast)' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview (fast)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (balanced)' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (powerful)' },
  ],
}

export function getModelsForProvider(provider: string): ModelOption[] {
  return PROVIDER_MODELS[provider] || []
}

export function getModelsWithCustom(provider: string, currentValue?: string): ModelOption[] {
  const models = [...getModelsForProvider(provider)]
  if (currentValue && !models.some(m => m.value === currentValue)) {
    models.unshift({ value: currentValue, label: `custom: ${currentValue}`, disabled: true })
  }
  return models
}
