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
    { value: 'claude-haiku-3-5', label: 'Claude 3.5 Haiku' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'o3-mini', label: 'o3 Mini' },
    { value: 'o3', label: 'o3' },
  ],
  azure: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'o3-mini', label: 'o3 Mini' },
    { value: 'o3', label: 'o3' },
  ],
  gemini: [
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
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
