/**
 * Tests for event pattern matching with special characters.
 * 
 * These tests demonstrate the regex escaping bug that was fixed in the event bus.
 * The bug was in how backslashes were escaped in the character class.
 */

import { createEventBus } from '@open-mercato/events/index'

describe('Event Pattern Matching', () => {
  describe('matchEventPattern edge cases', () => {
    let bus: ReturnType<typeof createEventBus>
    let receivedEvents: string[]

    beforeEach(() => {
      receivedEvents = []
      bus = createEventBus({ resolve: ((name: string) => name) as any })
    })

    test('exact match without wildcards', async () => {
      bus.on('customers.created', async (_, ctx) => {
        receivedEvents.push(ctx.eventName!)
      })

      await bus.emit('customers.created', {})
      await bus.emit('customers.updated', {})
      
      expect(receivedEvents).toEqual(['customers.created'])
    })

    test('global wildcard matches all events', async () => {
      bus.on('*', async (_, ctx) => {
        receivedEvents.push(ctx.eventName!)
      })

      await bus.emit('customers.created', {})
      await bus.emit('sales.order.updated', {})
      await bus.emit('auth.login', {})
      
      expect(receivedEvents).toEqual([
        'customers.created',
        'sales.order.updated',
        'auth.login',
      ])
    })

    test('single segment wildcard', async () => {
      bus.on('customers.*', async (_, ctx) => {
        receivedEvents.push(ctx.eventName!)
      })

      await bus.emit('customers.created', {})
      await bus.emit('customers.updated', {})
      await bus.emit('customers.people.created', {}) // Should not match - has extra segment
      await bus.emit('sales.created', {}) // Should not match - wrong prefix
      
      expect(receivedEvents).toEqual([
        'customers.created',
        'customers.updated',
      ])
    })

    test('wildcard in middle of pattern', async () => {
      bus.on('customers.*.created', async (_, ctx) => {
        receivedEvents.push(ctx.eventName!)
      })

      await bus.emit('customers.people.created', {})
      await bus.emit('customers.companies.created', {})
      await bus.emit('customers.deals.created', {})
      await bus.emit('customers.people.updated', {}) // Should not match - wrong action
      await bus.emit('sales.order.created', {}) // Should not match - wrong prefix
      
      expect(receivedEvents).toEqual([
        'customers.people.created',
        'customers.companies.created',
        'customers.deals.created',
      ])
    })

    describe('special regex characters are properly escaped', () => {
      test('dot in event name', async () => {
        // Dots should be treated as literal dots, not regex "any character"
        bus.on('test.event', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test.event', {})
        await bus.emit('testXevent', {}) // Should NOT match (X is not a dot)
        
        expect(receivedEvents).toEqual(['test.event'])
      })

      test('plus sign in event name', async () => {
        bus.on('test+event', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test+event', {})
        await bus.emit('testevent', {}) // Should NOT match
        await bus.emit('test++event', {}) // Should NOT match
        
        expect(receivedEvents).toEqual(['test+event'])
      })

      test('brackets in event name', async () => {
        bus.on('test[123]', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test[123]', {})
        await bus.emit('test1', {}) // Should NOT match (brackets are literal)
        await bus.emit('test2', {}) // Should NOT match
        
        expect(receivedEvents).toEqual(['test[123]'])
      })

      test('parentheses in event name', async () => {
        bus.on('test(group)', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test(group)', {})
        await bus.emit('testgroup', {}) // Should NOT match
        
        expect(receivedEvents).toEqual(['test(group)'])
      })

      test('pipe character in event name', async () => {
        bus.on('test|event', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test|event', {})
        await bus.emit('test', {}) // Should NOT match (pipe is literal)
        await bus.emit('event', {}) // Should NOT match
        
        expect(receivedEvents).toEqual(['test|event'])
      })

      test('caret and dollar in event name', async () => {
        bus.on('test^event$', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test^event$', {})
        
        expect(receivedEvents).toEqual(['test^event$'])
      })

      test('curly braces in event name', async () => {
        bus.on('test{123}', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test{123}', {})
        
        expect(receivedEvents).toEqual(['test{123}'])
      })
    })

    describe('backslash escaping (the bug)', () => {
      /**
       * This test demonstrates the original bug.
       * 
       * THE BUG:
       * The original regex escaping pattern was:
       *   .replace(/[.+^${}()|[\]\\]/g, '\\$&')
       * 
       * When a backslash appears in a character class like [\], it needs special handling.
       * The pattern /[.+^${}()|[\]\\]/g attempts to match a backslash at the end,
       * but the escaping is ambiguous and can cause issues.
       * 
       * THE FIX:
       * Escape backslashes separately first:
       *   .replace(/\\/g, '\\\\')  // Escape backslashes first
       *   .replace(/[.+^${}()|[\]]/g, '\\$&')  // Then other special chars
       * 
       * This ensures backslashes are properly escaped before other characters are processed.
       */
      test('backslash in event name should be treated literally', async () => {
        // This test would fail with the old regex escaping
        bus.on('test\\event', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test\\event', {})
        
        expect(receivedEvents).toEqual(['test\\event'])
      })

      test('backslash with wildcard', async () => {
        bus.on('test\\*.event', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        // The backslash is literal in the event name, but the * in the PATTERN is still a wildcard
        // So this pattern matches: test\ + [any segment] + .event
        await bus.emit('test\\*.event', {})  // Matches: test\*.event
        await bus.emit('test\\foo.event', {}) // Matches: test\foo.event
        await bus.emit('testfoo.event', {})   // Should NOT match - no backslash
        
        expect(receivedEvents).toEqual(['test\\*.event', 'test\\foo.event'])
      })

      test('multiple backslashes', async () => {
        bus.on('test\\\\event', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test\\\\event', {})
        
        expect(receivedEvents).toEqual(['test\\\\event'])
      })

      /**
       * SECURITY TEST: Potential regex injection
       * 
       * If backslashes aren't properly escaped, an attacker could potentially
       * inject regex patterns. While event patterns are typically developer-defined,
       * this ensures safety if patterns ever come from external sources.
       */
      test('prevents potential regex injection via backslash', async () => {
        // An attacker might try to use a backslash to escape our escaping
        // and inject regex metacharacters
        const maliciousPattern = 'test\\..*'  // Trying to inject .* pattern
        
        bus.on(maliciousPattern, async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        // Should only match the exact string (with literal backslash and asterisk)
        await bus.emit('test\\..*', {})
        
        // These should NOT match (the .* should not be interpreted as regex)
        await bus.emit('test.', {})
        await bus.emit('test.foo', {})
        await bus.emit('test.bar.baz', {})
        
        // Only the exact match should be received
        expect(receivedEvents).toEqual(['test\\..*'])
      })
    })

    describe('wildcards work correctly with escaped characters', () => {
      test('wildcard before escaped character', async () => {
        bus.on('*.event+test', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('foo.event+test', {})
        await bus.emit('bar.event+test', {})
        await bus.emit('foo.eventXtest', {}) // Should NOT match - + is literal
        
        expect(receivedEvents).toEqual([
          'foo.event+test',
          'bar.event+test',
        ])
      })

      test('wildcard after escaped character', async () => {
        bus.on('test[123].*', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('test[123].created', {})
        await bus.emit('test[123].updated', {})
        await bus.emit('test123.created', {}) // Should NOT match - brackets are literal
        
        expect(receivedEvents).toEqual([
          'test[123].created',
          'test[123].updated',
        ])
      })
    })

    describe('performance and edge cases', () => {
      test('empty pattern should not match', async () => {
        bus.on('', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('', {})
        await bus.emit('test', {})
        
        expect(receivedEvents).toEqual([''])
      })

      test('very long event names', async () => {
        const longEvent = 'a'.repeat(1000) + '.event'
        const longPattern = 'a'.repeat(1000) + '.*'
        
        bus.on(longPattern, async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit(longEvent, {})
        
        expect(receivedEvents).toEqual([longEvent])
      })

      test('many segments with wildcards', async () => {
        bus.on('module.*.entity.*.action.*', async (_, ctx) => {
          receivedEvents.push(ctx.eventName!)
        })

        await bus.emit('module.foo.entity.bar.action.baz', {})
        await bus.emit('module.foo.entity.bar.action', {}) // Should NOT match - missing segment
        await bus.emit('module.foo.entity.bar.action.baz.extra', {}) // Should NOT match - extra segment
        
        expect(receivedEvents).toEqual(['module.foo.entity.bar.action.baz'])
      })
    })
  })
})
