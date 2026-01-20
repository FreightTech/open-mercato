# QuoteWizard State Management Guide

## Core Principle: Optimistic Updates Only

The QuoteWizard uses **optimistic updates** for all state management. The UI state should NEVER reload or refetch after mutations. This ensures a smooth user experience without flickering or data loss.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    QuoteWizardContext                        │
│  (Single source of truth for all wizard state)              │
├─────────────────────────────────────────────────────────────┤
│  NEW MODE          │  EDIT MODE                             │
│  ─────────────     │  ──────────                            │
│  Pure useState     │  React Query + Optimistic Updates      │
│  No server calls   │  Server sync in background             │
│  until explicit    │  UI never waits for server             │
│  Save action       │                                        │
└─────────────────────────────────────────────────────────────┘
```

## State Management Rules

### 1. NEVER Invalidate Queries After Mutations

```typescript
// ❌ WRONG - causes UI reload
onSettled: () => {
  queryClient.invalidateQueries({ queryKey })
}

// ✅ CORRECT - keep optimistic state
onError: (err, _updates, context) => {
  // Only rollback on error
  if (context?.previous) {
    queryClient.setQueryData(queryKey, context.previous)
  }
}
// No onSettled, no invalidation on success
```

### 2. Always Use Optimistic Updates

```typescript
// ✅ CORRECT - update UI immediately
onMutate: async (updates) => {
  await queryClient.cancelQueries({ queryKey })
  const previous = queryClient.getQueryData(queryKey)

  // Update cache immediately - UI reflects this instantly
  if (previous) {
    queryClient.setQueryData(queryKey, { ...previous, ...updates })
  }

  return { previous }
}
```

### 3. Server Syncs in Background

The server call happens asynchronously. The UI does NOT wait for it:

```
User Action → Optimistic Update → UI Updates Instantly
                    ↓
              Server Call (background)
                    ↓
              Success: Keep state as-is
              Error: Rollback to previous
```

### 4. New Mode vs Edit Mode

| Aspect | New Mode | Edit Mode |
|--------|----------|-----------|
| State storage | `useState` | React Query cache |
| Server calls | None until Save | Background sync |
| Data source | `draftQuote`, `draftLines` | `fetchedQuote`, `fetchedLines` |
| Refetching | Never | Never (optimistic only) |

## Key Files

| File | Purpose |
|------|---------|
| `QuoteWizardContext.tsx` | Main provider, orchestrates all state |
| `useQuoteQuery.ts` | Quote CRUD with optimistic updates |
| `useQuoteLinesQuery.ts` | Lines CRUD with optimistic updates |
| `useLineUpdates.ts` | Debounced line updates |
| `useQuoteCalculations.ts` | Margin/price calculations |

## Adding New Features

When adding features that modify quote or line state:

1. **Use the context actions** - Don't create new mutations
   ```typescript
   const { updateQuote, addLine, updateLine, removeLine } = useQuoteWizardContext()
   ```

2. **For read-only data** (like client history), use separate queries
   ```typescript
   // ✅ OK - separate query for display-only data
   const { data: clientQuotes } = useQuery({
     queryKey: ['client-quotes', clientId],
     // ...
   })
   ```

3. **Never refetch the main quote/lines** after your feature updates something
   ```typescript
   // ❌ WRONG
   await updateSomething()
   queryClient.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) })

   // ✅ CORRECT
   await updateSomething()
   // Let optimistic update handle it, or update cache directly
   ```

## Context Panel & Side Effects

The context panel (`QuoteWizardContextPanel`) displays derived data based on the quote state:
- Documents for the quote
- Recent quotes for the selected client
- Exchange rates

These are **read-only queries** that react to state changes but NEVER modify the main quote state.

```typescript
// Context panel receives props from parent
<QuoteWizardContextPanel
  clientId={quote.clientId}      // React to client changes
  quoteId={effectiveQuoteId}     // React to quote persistence
  // ...
/>
```

When `clientId` changes, the context panel's `useClientQuotes` hook refetches client history. This is fine because it's a separate, read-only query that doesn't affect the main wizard state.

## Debugging State Issues

If the UI "reloads" or "flickers" after an action:

1. Check for `invalidateQueries` calls on the quote/lines query keys
2. Check for missing `onMutate` optimistic updates
3. Check for accidental refetch triggers (like missing `enabled: false`)
4. Ensure mutations don't have `onSettled` that invalidates

## Testing Checklist

When modifying state management:

- [ ] Edit a field → UI updates instantly, no flicker
- [ ] Edit a field → Server call happens in background
- [ ] Edit a field → If server fails, UI rolls back
- [ ] Select client → Client name persists in table
- [ ] Add line → Line appears instantly
- [ ] Close and reopen → State matches what was saved
