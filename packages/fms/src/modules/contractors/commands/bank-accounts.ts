import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { ContractorBankAccount, Contractor } from '../data/entities'
import {
  bankAccountCreateSchema,
  bankAccountUpdateSchema,
  bankAccountBatchCreateSchema,
  type BankAccountCreateInput,
  type BankAccountUpdateInput,
  type BankAccountBatchCreateInput,
} from '../data/validators'

type BankAccountCreateCommandInput = BankAccountCreateInput & {
  contractorId: string
}

type BankAccountUpdateCommandInput = BankAccountUpdateInput & {
  id: string
}

type BankAccountBatchCreateCommandInput = BankAccountBatchCreateInput & {
  contractorId: string
}

const createBankAccountCommand: CommandHandler<BankAccountCreateCommandInput, { bankAccountId: string }> = {
  id: 'contractors.bank-accounts.create',
  async execute(rawInput, ctx) {
    const parsed = bankAccountCreateSchema.parse(rawInput)
    const contractorId = rawInput.contractorId

    if (!contractorId) {
      throw new CrudHttpError(400, { error: 'contractorId is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const contractor = await em.findOne(Contractor, { id: contractorId, deletedAt: null })
    if (!contractor) {
      throw new CrudHttpError(404, { error: 'Contractor not found' })
    }

    const bankAccount = em.create(ContractorBankAccount, {
      organizationId: contractor.organizationId,
      tenantId: contractor.tenantId,
      contractor,
      bankName: parsed.bankName ?? null,
      iban: parsed.iban ?? null,
      swiftBic: parsed.swiftBic ?? null,
      currencyCode: parsed.currencyCode ?? 'USD',
      isPrimary: parsed.isPrimary ?? false,
    })

    em.persist(bankAccount)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: bankAccount,
      identifiers: { id: bankAccount.id, tenantId: contractor.tenantId, organizationId: contractor.organizationId },
    })

    return { bankAccountId: bankAccount.id }
  },
}

const batchCreateBankAccountsCommand: CommandHandler<BankAccountBatchCreateCommandInput, { bankAccountIds: string[] }> = {
  id: 'contractors.bank-accounts.batch-create',
  async execute(rawInput, ctx) {
    const parsed = bankAccountBatchCreateSchema.parse(rawInput)
    const contractorId = rawInput.contractorId

    if (!contractorId) {
      throw new CrudHttpError(400, { error: 'contractorId is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const contractor = await em.findOne(Contractor, { id: contractorId, deletedAt: null })
    if (!contractor) {
      throw new CrudHttpError(404, { error: 'Contractor not found' })
    }

    const bankAccountIds: string[] = []
    const bankAccounts: ContractorBankAccount[] = []

    for (const accountData of parsed.accounts) {
      const bankAccount = em.create(ContractorBankAccount, {
        organizationId: contractor.organizationId,
        tenantId: contractor.tenantId,
        contractor,
        bankName: accountData.bankName ?? null,
        iban: accountData.iban ?? null,
        swiftBic: accountData.swiftBic ?? null,
        currencyCode: accountData.currencyCode ?? 'USD',
        isPrimary: accountData.isPrimary ?? false,
      })
      em.persist(bankAccount)
      bankAccounts.push(bankAccount)
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    for (const bankAccount of bankAccounts) {
      bankAccountIds.push(bankAccount.id)
      await emitCrudSideEffects({
        dataEngine: de,
        action: 'created',
        entity: bankAccount,
        identifiers: { id: bankAccount.id, tenantId: contractor.tenantId, organizationId: contractor.organizationId },
      })
    }

    return { bankAccountIds }
  },
}

const updateBankAccountCommand: CommandHandler<BankAccountUpdateCommandInput, { bankAccountId: string }> = {
  id: 'contractors.bank-accounts.update',
  async execute(rawInput, ctx) {
    const parsed = bankAccountUpdateSchema.parse(rawInput)
    const id = rawInput.id

    if (!id) {
      throw new CrudHttpError(400, { error: 'Bank account id is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const bankAccount = await em.findOne(ContractorBankAccount, { id })

    if (!bankAccount) {
      throw new CrudHttpError(404, { error: 'Bank account not found' })
    }

    if (parsed.bankName !== undefined) bankAccount.bankName = parsed.bankName ?? null
    if (parsed.iban !== undefined) bankAccount.iban = parsed.iban ?? null
    if (parsed.swiftBic !== undefined) bankAccount.swiftBic = parsed.swiftBic ?? null
    if (parsed.currencyCode !== undefined) bankAccount.currencyCode = parsed.currencyCode
    if (parsed.isPrimary !== undefined) bankAccount.isPrimary = parsed.isPrimary

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: bankAccount,
      identifiers: { id: bankAccount.id, tenantId: bankAccount.tenantId, organizationId: bankAccount.organizationId },
    })

    return { bankAccountId: bankAccount.id }
  },
}

const deleteBankAccountCommand: CommandHandler<{ id: string }, { bankAccountId: string }> = {
  id: 'contractors.bank-accounts.delete',
  async execute(rawInput, ctx) {
    const id = rawInput.id

    if (!id) {
      throw new CrudHttpError(400, { error: 'Bank account id is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const bankAccount = await em.findOne(ContractorBankAccount, { id })

    if (!bankAccount) {
      throw new CrudHttpError(404, { error: 'Bank account not found' })
    }

    const tenantId = bankAccount.tenantId
    const organizationId = bankAccount.organizationId
    await em.remove(bankAccount).flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: { id } as ContractorBankAccount,
      identifiers: { id, tenantId, organizationId },
    })

    return { bankAccountId: id }
  },
}

registerCommand(createBankAccountCommand)
registerCommand(batchCreateBankAccountsCommand)
registerCommand(updateBankAccountCommand)
registerCommand(deleteBankAccountCommand)
