import { describe, it, expect } from 'vitest'

describe('PROVIDER_MODELS constant', () => {
  it('exports model lists for all 4 providers', async () => {
    const { PROVIDER_MODELS } = await import('../../../lib/models')
    expect(PROVIDER_MODELS).toHaveProperty('anthropic')
    expect(PROVIDER_MODELS).toHaveProperty('openai')
    expect(PROVIDER_MODELS).toHaveProperty('azure')
    expect(PROVIDER_MODELS).toHaveProperty('gemini')
  })

  it('each provider has at least 2 models with value and label', async () => {
    const { PROVIDER_MODELS } = await import('../../../lib/models')
    for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
      expect(models.length, `${provider} should have at least 2 models`).toBeGreaterThanOrEqual(2)
      for (const m of models) {
        expect(m).toHaveProperty('value')
        expect(m).toHaveProperty('label')
        expect(typeof m.value).toBe('string')
        expect(typeof m.label).toBe('string')
      }
    }
  })

  it('azure models match openai models', async () => {
    const { PROVIDER_MODELS } = await import('../../../lib/models')
    const azureValues = PROVIDER_MODELS.azure.map(m => m.value)
    const openaiValues = PROVIDER_MODELS.openai.map(m => m.value)
    expect(azureValues).toEqual(openaiValues)
  })

  it('anthropic models include claude variants', async () => {
    const { PROVIDER_MODELS } = await import('../../../lib/models')
    const values = PROVIDER_MODELS.anthropic.map(m => m.value)
    expect(values).toContain('claude-haiku-3-5')
    expect(values).toContain('claude-sonnet-4-6')
    expect(values).toContain('claude-opus-4-6')
  })

  it('gemini models include gemini variants', async () => {
    const { PROVIDER_MODELS } = await import('../../../lib/models')
    const values = PROVIDER_MODELS.gemini.map(m => m.value)
    expect(values).toContain('gemini-2.5-flash')
    expect(values).toContain('gemini-3.1-pro')
  })

  it('getModelsForProvider returns models for given provider', async () => {
    const { getModelsForProvider } = await import('../../../lib/models')
    const models = getModelsForProvider('anthropic')
    expect(models.length).toBeGreaterThanOrEqual(2)
    expect(models[0]).toHaveProperty('value')
  })

  it('getModelsForProvider returns empty array for unknown provider', async () => {
    const { getModelsForProvider } = await import('../../../lib/models')
    const models = getModelsForProvider('unknown-provider')
    expect(models).toEqual([])
  })

  it('getModelsWithCustom adds custom option if value not in list', async () => {
    const { getModelsWithCustom } = await import('../../../lib/models')
    const models = getModelsWithCustom('anthropic', 'my-custom-model')
    const customOption = models.find(m => m.value === 'my-custom-model')
    expect(customOption).toBeDefined()
    expect(customOption!.label).toContain('custom')
    expect(customOption!.disabled).toBe(true)
  })

  it('getModelsWithCustom does NOT add custom option if value is in list', async () => {
    const { getModelsWithCustom } = await import('../../../lib/models')
    const models = getModelsWithCustom('anthropic', 'claude-sonnet-4-6')
    const countSonnet = models.filter(m => m.value === 'claude-sonnet-4-6')
    expect(countSonnet.length).toBe(1) // no duplicate
  })
})
