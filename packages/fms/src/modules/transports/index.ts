import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
import './commands/register_tracking'

export const metadata: ModuleInfo = {
    name: 'transports',
    title: 'Transports',
    version: '1.0.0',
    description: 'Transport tracking and management'
};
