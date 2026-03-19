import { generateObject } from 'ai'
import {
  resolveFirstConfiguredOpenCodeProvider,
  resolveOpenCodeModel,
  resolveOpenCodeProviderApiKey,
  resolveOpenCodeProviderId,
  type OpenCodeProviderId,
} from '@open-mercato/shared/lib/ai/opencode-provider'
import { rfqExtractionResultSchema, chargeExtractionResultSchema } from '../data/validators'

type AiModel = Parameters<typeof generateObject>[0]['model']
function asAiModel(model: unknown): AiModel {
  return model as AiModel
}

export function resolveExtractionProviderId(): OpenCodeProviderId {
  const configuredProvider = process.env.OPENCODE_PROVIDER
  if (configuredProvider && configuredProvider.trim().length > 0) {
    return resolveOpenCodeProviderId(configuredProvider)
  }

  // Prefer OpenAI for structured output (faster with JSON mode)
  const firstConfiguredProvider = resolveFirstConfiguredOpenCodeProvider({
    order: ['openai', 'anthropic', 'google'],
  })
  if (firstConfiguredProvider) {
    return firstConfiguredProvider
  }

  return resolveOpenCodeProviderId(undefined)
}

export async function createStructuredModel(
  providerId: OpenCodeProviderId,
  apiKey: string,
  modelId: string,
): Promise<AiModel> {
  switch (providerId) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return asAiModel(createAnthropic({ apiKey })(modelId))
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return asAiModel(createOpenAI({ apiKey })(modelId))
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return asAiModel(createGoogleGenerativeAI({ apiKey })(modelId))
    }
    default:
      throw new Error(`Unsupported provider: ${providerId}`)
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })

  try {
    return await Promise.race([operation, timeoutPromise])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

export async function runRfqExtraction(input: {
  systemPrompt: string
  userPrompt: string
  modelOverride?: string | null
  timeoutMs: number
}): Promise<{
  object: ReturnType<typeof rfqExtractionResultSchema.parse>
  totalTokens: number
  modelWithProvider: string
}> {
  const providerId = resolveExtractionProviderId()
  const apiKey = resolveOpenCodeProviderApiKey(providerId)
  if (!apiKey) {
    throw new Error(`Missing API key for provider "${providerId}"`)
  }

  const modelConfig = resolveOpenCodeModel(providerId, {
    overrideModel: input.modelOverride,
  })

  console.log(`[rfq-extraction] Starting with ${modelConfig.modelWithProvider} (timeout: ${input.timeoutMs}ms)`)
  const startTime = Date.now()

  const model = await createStructuredModel(providerId, apiKey, modelConfig.modelId)

  const result = await withTimeout(
    generateObject({
      model,
      schema: rfqExtractionResultSchema,
      system: input.systemPrompt,
      prompt: input.userPrompt,
      temperature: 0,
    }),
    input.timeoutMs,
    `RFQ extraction timed out after ${input.timeoutMs}ms`,
  )

  const elapsed = Date.now() - startTime
  console.log(`[rfq-extraction] Completed in ${elapsed}ms, tokens: ${result.usage?.totalTokens ?? 0}`)

  return {
    object: result.object,
    totalTokens: Number(result.usage?.totalTokens ?? 0) || 0,
    modelWithProvider: modelConfig.modelWithProvider,
  }
}

export async function runChargeExtraction(input: {
  systemPrompt: string
  userPrompt: string
  imageBase64?: string
  modelOverride?: string | null
  timeoutMs: number
}): Promise<{
  object: ReturnType<typeof chargeExtractionResultSchema.parse>
  totalTokens: number
  modelWithProvider: string
}> {
  const providerId = resolveExtractionProviderId()
  const apiKey = resolveOpenCodeProviderApiKey(providerId)
  if (!apiKey) {
    throw new Error(`Missing API key for provider "${providerId}"`)
  }

  const modelConfig = resolveOpenCodeModel(providerId, {
    overrideModel: input.modelOverride,
  })

  console.log(`[charge-extraction] Starting with ${modelConfig.modelWithProvider} (timeout: ${input.timeoutMs}ms)`)
  const startTime = Date.now()

  const model = await createStructuredModel(providerId, apiKey, modelConfig.modelId)

  const generateOptions: any = {
    model,
    schema: chargeExtractionResultSchema,
    system: input.systemPrompt,
    temperature: 0,
  }

  if (input.imageBase64) {
    generateOptions.messages = [{
      role: 'user' as const,
      content: [
        { type: 'image' as const, image: input.imageBase64 },
        { type: 'text' as const, text: input.userPrompt },
      ],
    }]
  } else {
    generateOptions.prompt = input.userPrompt
  }

  const result = await withTimeout(
    generateObject(generateOptions),
    input.timeoutMs,
    `Charge extraction timed out after ${input.timeoutMs}ms`,
  )

  const elapsed = Date.now() - startTime
  console.log(`[charge-extraction] Completed in ${elapsed}ms, tokens: ${result.usage?.totalTokens ?? 0}`)

  return {
    object: result.object as ReturnType<typeof chargeExtractionResultSchema.parse>,
    totalTokens: Number(result.usage?.totalTokens ?? 0) || 0,
    modelWithProvider: modelConfig.modelWithProvider,
  }
}
