import { registerAutomationNodeType } from '../node-type-registry'

// Triggers
import { manualTrigger } from './triggers/manual'
import { eventTrigger } from './triggers/event'
import { webhookTrigger } from './triggers/webhook'
import { scheduleTrigger } from './triggers/schedule'

// Actions
import { httpRequestAction } from './actions/http-request'
import { sendEmailAction } from './actions/send-email'
import { updateEntityAction } from './actions/update-entity'
import { emitEventAction } from './actions/emit-event'
import { transformAction } from './actions/transform'
import { codeAction } from './actions/code'
import { delayAction } from './actions/delay'
import { setVariableAction } from './actions/set-variable'
import { filterAction } from './actions/filter'
import { respondWebhookAction } from './actions/respond-webhook'

// Logic
import { ifLogic } from './logic/if'
import { switchLogic } from './logic/switch'
import { mergeLogic } from './logic/merge'
import { loopLogic } from './logic/loop'

// Utility
import { noopUtility } from './utility/noop'

const builtinNodeTypes = [
  // Triggers
  manualTrigger,
  eventTrigger,
  webhookTrigger,
  scheduleTrigger,

  // Actions
  httpRequestAction,
  sendEmailAction,
  updateEntityAction,
  emitEventAction,
  transformAction,
  codeAction,
  delayAction,
  setVariableAction,
  filterAction,
  respondWebhookAction,

  // Logic
  ifLogic,
  switchLogic,
  mergeLogic,
  loopLogic,

  // Utility
  noopUtility,
]

let registered = false

export function registerBuiltinNodeTypes(): void {
  if (registered) return
  for (const nodeType of builtinNodeTypes) {
    registerAutomationNodeType(nodeType)
  }
  registered = true
}
