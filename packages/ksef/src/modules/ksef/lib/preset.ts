import { parseBooleanToken } from '@open-mercato/shared/lib/boolean'
import type { IntegrationScope } from '@open-mercato/shared/modules/integrations/types'
import type { CredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import type { IntegrationLogService } from '@open-mercato/core/modules/integrations/lib/log-service'
import type { IntegrationStateService } from '@open-mercato/core/modules/integrations/lib/state-service'

const KSEF_INTEGRATION_ID = 'ksef'

type KsefCredentialShape = {
  nip: string
  authType: 'token' | 'certificate'
  ksefToken?: string
  certificatePem?: string
  privateKeyPem?: string
  environment: 'test' | 'demo' | 'production'
}

type KsefEnvPreset = {
  credentials: KsefCredentialShape
  force: boolean
  enabled: boolean
}

export type ApplyKsefPresetResult =
  | { status: 'skipped'; reason: string }
  | { status: 'configured'; enabled: boolean }

function readEnvValue(env: NodeJS.ProcessEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return undefined
}

function readBooleanEnv(env: NodeJS.ProcessEnv, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const parsed = parseBooleanToken(env[key])
    if (parsed !== null) return parsed
  }
  return undefined
}

export function readKsefEnvPreset(env: NodeJS.ProcessEnv = process.env): KsefEnvPreset | null {
  const nip = readEnvValue(env, [
    'OM_INTEGRATION_KSEF_NIP',
    'KSEF_NIP',
  ])

  if (!nip) return null

  const authType = readEnvValue(env, [
    'OM_INTEGRATION_KSEF_AUTH_TYPE',
    'KSEF_AUTH_TYPE',
  ]) as 'token' | 'certificate' | undefined ?? 'token'

  const ksefToken = readEnvValue(env, [
    'OM_INTEGRATION_KSEF_TOKEN',
    'KSEF_TOKEN',
  ])

  const certificatePem = readEnvValue(env, [
    'OM_INTEGRATION_KSEF_CERT_PEM',
    'KSEF_CERT_PEM',
  ])

  const privateKeyPem = readEnvValue(env, [
    'OM_INTEGRATION_KSEF_KEY_PEM',
    'KSEF_KEY_PEM',
  ])

  const environment = readEnvValue(env, [
    'OM_INTEGRATION_KSEF_ENVIRONMENT',
    'KSEF_ENVIRONMENT',
  ]) as 'test' | 'demo' | 'production' | undefined ?? 'test'

  if (authType === 'token' && !ksefToken) {
    throw new Error('[ksef] Incomplete env preset. OM_INTEGRATION_KSEF_TOKEN is required when auth type is "token".')
  }

  if (authType === 'certificate' && (!certificatePem || !privateKeyPem)) {
    throw new Error('[ksef] Incomplete env preset. OM_INTEGRATION_KSEF_CERT_PEM and OM_INTEGRATION_KSEF_KEY_PEM are required when auth type is "certificate".')
  }

  return {
    credentials: {
      nip,
      authType,
      ksefToken,
      certificatePem,
      privateKeyPem,
      environment,
    },
    force: readBooleanEnv(env, [
      'OM_INTEGRATION_KSEF_FORCE_PRECONFIGURE',
      'KSEF_FORCE_PRECONFIGURE',
    ]) ?? false,
    enabled: readBooleanEnv(env, [
      'OM_INTEGRATION_KSEF_ENABLED',
      'KSEF_ENABLED',
    ]) ?? true,
  }
}

async function hasExistingKsefConfiguration(
  credentialsService: CredentialsService,
  integrationStateService: IntegrationStateService,
  scope: IntegrationScope,
): Promise<boolean> {
  const [credentials, state] = await Promise.all([
    credentialsService.getRaw(KSEF_INTEGRATION_ID, scope),
    integrationStateService.get(KSEF_INTEGRATION_ID, scope),
  ])

  return Boolean(credentials) || Boolean(state)
}

export async function applyKsefEnvPreset(params: {
  credentialsService: CredentialsService
  integrationStateService: IntegrationStateService
  integrationLogService?: IntegrationLogService
  scope: IntegrationScope
  force?: boolean
  env?: NodeJS.ProcessEnv
}): Promise<ApplyKsefPresetResult> {
  const preset = readKsefEnvPreset(params.env)
  if (!preset) {
    return { status: 'skipped', reason: 'No KSeF preset env variables were provided.' }
  }

  const force = params.force ?? preset.force
  if (!force && await hasExistingKsefConfiguration(params.credentialsService, params.integrationStateService, params.scope)) {
    return { status: 'skipped', reason: 'KSeF credentials or state already exist. Use force to overwrite them.' }
  }

  await params.credentialsService.save(KSEF_INTEGRATION_ID, preset.credentials, params.scope)
  await params.integrationStateService.upsert(
    KSEF_INTEGRATION_ID,
    { isEnabled: preset.enabled },
    params.scope,
  )

  if (params.integrationLogService) {
    await params.integrationLogService.scoped(KSEF_INTEGRATION_ID, params.scope).info(
      'KSeF integration was preconfigured from environment variables.',
      {
        enabled: preset.enabled,
        nip: preset.credentials.nip,
        environment: preset.credentials.environment,
        authType: preset.credentials.authType,
      },
    )
  }

  return {
    status: 'configured',
    enabled: preset.enabled,
  }
}
