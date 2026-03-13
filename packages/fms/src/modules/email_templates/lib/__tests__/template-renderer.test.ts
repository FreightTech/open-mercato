import { describe, it, expect } from 'vitest'
import { markdownToHtml, renderTemplate, buildEmailHtml, getDefaultTemplate } from '../template-renderer'

describe('template-renderer', () => {
  describe('markdownToHtml', () => {
    it('should convert h1 headers', () => {
      const result = markdownToHtml('# Header 1')
      expect(result).toContain('<h1>Header 1</h1>')
    })

    it('should convert h2 headers', () => {
      const result = markdownToHtml('## Header 2')
      expect(result).toContain('<h2>Header 2</h2>')
    })

    it('should convert h3 headers', () => {
      const result = markdownToHtml('### Header 3')
      expect(result).toContain('<h3>Header 3</h3>')
    })

    it('should convert bold text with double asterisks', () => {
      const result = markdownToHtml('This is **bold** text')
      expect(result).toContain('<strong>bold</strong>')
    })

    it('should convert italic text with single asterisks', () => {
      const result = markdownToHtml('This is *italic* text')
      expect(result).toContain('<em>italic</em>')
    })

    it('should convert bold italic with triple asterisks', () => {
      const result = markdownToHtml('This is ***bold italic*** text')
      expect(result).toContain('<strong><em>bold italic</em></strong>')
    })

    it('should convert unordered lists with dashes', () => {
      const result = markdownToHtml('- Item 1\n- Item 2')
      expect(result).toContain('<li>Item 1</li>')
      expect(result).toContain('<li>Item 2</li>')
      expect(result).toContain('<ul>')
    })

    it('should convert unordered lists with asterisks', () => {
      const result = markdownToHtml('* Item A\n* Item B')
      expect(result).toContain('<li>Item A</li>')
      expect(result).toContain('<li>Item B</li>')
    })

    it('should convert line breaks', () => {
      const result = markdownToHtml('Line 1\nLine 2')
      expect(result).toContain('<br>')
    })

    it('should handle multiple formatting in same text', () => {
      const result = markdownToHtml('# Title\nThis is **bold** and *italic*')
      expect(result).toContain('<h1>Title</h1>')
      expect(result).toContain('<strong>bold</strong>')
      expect(result).toContain('<em>italic</em>')
    })
  })

  describe('renderTemplate', () => {
    it('should replace {{variable}} placeholders', () => {
      const template = 'Hello {{name}}, your order is {{orderNumber}}'
      const variables = { name: 'John', orderNumber: 'ORD-001' }
      const result = renderTemplate(template, variables)
      expect(result).toBe('Hello John, your order is ORD-001')
    })

    it('should leave unreplaced variables unchanged', () => {
      const template = 'Hello {{name}}, your {{missing}} is ready'
      const variables = { name: 'John' }
      const result = renderTemplate(template, variables)
      expect(result).toBe('Hello John, your {{missing}} is ready')
    })

    it('should handle empty string values', () => {
      const template = 'Value: {{value}}'
      const result = renderTemplate(template, { value: '' })
      expect(result).toBe('Value: ')
    })

    it('should handle numeric values', () => {
      const template = 'Amount: {{amount}}'
      const result = renderTemplate(template, { amount: 12345 })
      expect(result).toBe('Amount: 12345')
    })

    it('should handle {{#if}}...{{/if}} conditionals - truthy value', () => {
      const template = '{{#if showMessage}}Message: {{message}}{{/if}}'
      const variables = { showMessage: true, message: 'Hello' }
      const result = renderTemplate(template, variables)
      expect(result).toBe('Message: Hello')
    })

    it('should handle {{#if}}...{{/if}} conditionals - truthy string', () => {
      const template = '{{#if name}}Hello {{name}}{{/if}}'
      const variables = { name: 'John' }
      const result = renderTemplate(template, variables)
      expect(result).toBe('Hello John')
    })

    it('should handle {{#if}}...{{/if}} conditionals - falsy boolean', () => {
      const template = 'Start {{#if showMessage}}Message: {{message}}{{/if}} End'
      const variables = { showMessage: false, message: 'Hello' }
      const result = renderTemplate(template, variables)
      expect(result).toBe('Start  End')
    })

    it('should hide content when condition is empty string', () => {
      const template = '{{#if name}}Name: {{name}}{{/if}}'
      const variables = { name: '' }
      const result = renderTemplate(template, variables)
      expect(result).toBe('')
    })

    it('should hide content when condition is undefined', () => {
      const template = '{{#if missing}}Content{{/if}}'
      const variables = {}
      const result = renderTemplate(template, variables)
      expect(result).toBe('')
    })

    it('should handle {{#each}}...{{/each}} loops with primitive arrays', () => {
      const template = 'Items: {{#each items}}{{this}}, {{/each}}'
      const variables = { items: ['A', 'B', 'C'] }
      const result = renderTemplate(template, variables)
      expect(result).toBe('Items: A, B, C, ')
    })

    it('should handle {{#each}}...{{/each}} loops with object arrays', () => {
      const template = '{{#each lines}}{{name}}: {{price}}; {{/each}}'
      const variables = {
        lines: [
          { name: 'Item 1', price: '10.00' },
          { name: 'Item 2', price: '20.00' },
        ],
      }
      const result = renderTemplate(template, variables)
      expect(result).toBe('Item 1: 10.00; Item 2: 20.00; ')
    })

    it('should handle {{@index}} in loops', () => {
      const template = '{{#each items}}{{@index}}: {{this}}; {{/each}}'
      const variables = { items: ['A', 'B'] }
      const result = renderTemplate(template, variables)
      expect(result).toBe('0: A; 1: B; ')
    })

    it('should handle empty arrays in loops', () => {
      const template = 'Items: {{#each items}}{{this}}{{/each}}'
      const variables = { items: [] }
      const result = renderTemplate(template, variables)
      expect(result).toBe('Items: ')
    })

    it('should handle non-array values in loops gracefully', () => {
      const template = '{{#each items}}{{this}}{{/each}}'
      const variables = { items: 'not an array' }
      const result = renderTemplate(template, variables)
      expect(result).toBe('')
    })

    it('should handle nested conditionals and loops', () => {
      const template = '{{#if hasItems}}{{#each items}}{{name}}{{/each}}{{/if}}'
      const variables = { hasItems: true, items: [{ name: 'A' }, { name: 'B' }] }
      const result = renderTemplate(template, variables)
      expect(result).toBe('AB')
    })

    it('should handle multiple conditionals', () => {
      const template = '{{#if a}}A{{/if}} {{#if b}}B{{/if}} {{#if c}}C{{/if}}'
      const variables = { a: true, b: false, c: true }
      const result = renderTemplate(template, variables)
      expect(result).toBe('A  C')
    })
  })

  describe('buildEmailHtml', () => {
    it('should wrap content in email HTML structure', () => {
      const result = buildEmailHtml('Hello **World**', {}, {})
      expect(result).toContain('<!DOCTYPE html>')
      expect(result).toContain('<html>')
      expect(result).toContain('email-container')
      expect(result).toContain('<strong>World</strong>')
    })

    it('should include company name in header when no logo', () => {
      const result = buildEmailHtml('Content', {}, { companyName: 'Acme Corp' })
      expect(result).toContain('Acme Corp')
    })

    it('should include company logo when provided', () => {
      const result = buildEmailHtml('Content', {}, { companyLogoUrl: 'https://example.com/logo.png' })
      expect(result).toContain('https://example.com/logo.png')
      expect(result).toContain('<img')
    })

    it('should apply primary color to styles', () => {
      const result = buildEmailHtml('Content', {}, { primaryColor: '#ff0000' })
      expect(result).toContain('#ff0000')
    })

    it('should apply accent color to styles', () => {
      const result = buildEmailHtml('Content', {}, { accentColor: '#00ff00' })
      expect(result).toContain('#00ff00')
    })

    it('should include footer text', () => {
      const result = buildEmailHtml('Content', {}, {
        footerText: 'Thank you for your business',
      })
      expect(result).toContain('Thank you for your business')
    })

    it('should include footer disclaimer', () => {
      const result = buildEmailHtml('Content', {}, {
        footerDisclaimer: 'Do not reply to this email',
      })
      expect(result).toContain('Do not reply to this email')
    })

    it('should include contact email in footer', () => {
      const result = buildEmailHtml('Content', {}, {
        contactEmail: 'support@example.com',
      })
      expect(result).toContain('support@example.com')
      expect(result).toContain('mailto:support@example.com')
    })

    it('should include contact phone in footer', () => {
      const result = buildEmailHtml('Content', {}, {
        contactPhone: '+1234567890',
      })
      expect(result).toContain('+1234567890')
    })

    it('should include website URL in footer', () => {
      const result = buildEmailHtml('Content', {}, {
        websiteUrl: 'https://example.com',
      })
      expect(result).toContain('https://example.com')
    })

    it('should render template variables in content', () => {
      const result = buildEmailHtml('Hello {{name}}', { name: 'John' }, {})
      expect(result).toContain('Hello John')
    })

    it('should use default company name when not provided', () => {
      const result = buildEmailHtml('Content', {}, {})
      expect(result).toContain('Open Mercato')
    })
  })

  describe('getDefaultTemplate', () => {
    it('should return offer template with subject and html', () => {
      const template = getDefaultTemplate('offer')
      expect(template).toHaveProperty('subject')
      expect(template).toHaveProperty('html')
      expect(template.subject).toContain('{{offerNumber}}')
    })

    it('should return offer template with route variables', () => {
      const template = getDefaultTemplate('offer')
      expect(template.subject).toContain('{{originPorts}}')
      expect(template.subject).toContain('{{destPorts}}')
    })

    it('should return invoice template', () => {
      const template = getDefaultTemplate('invoice')
      expect(template.subject).toContain('Invoice')
      expect(template.subject).toContain('{{invoiceNumber}}')
      expect(template.html).toContain('{{invoiceNumber}}')
      expect(template.html).toContain('{{dueDate}}')
    })

    it('should return booking_confirmation template', () => {
      const template = getDefaultTemplate('booking_confirmation')
      expect(template.subject).toContain('Booking')
      expect(template.subject).toContain('{{bookingNumber}}')
      expect(template.html).toContain('{{bookingNumber}}')
    })

    it('should return shipment_notification template', () => {
      const template = getDefaultTemplate('shipment_notification')
      expect(template.subject).toContain('Shipment')
      expect(template.subject).toContain('{{shipmentNumber}}')
      expect(template.html).toContain('{{status}}')
    })

    it('should return quote_request template', () => {
      const template = getDefaultTemplate('quote_request')
      expect(template.subject).toContain('RFQ')
      expect(template.html).toContain('{{rfqTitle}}')
    })

    it('should return general_message template', () => {
      const template = getDefaultTemplate('general_message')
      expect(template.subject).toContain('Message')
      expect(template.html).toContain('{{message}}')
    })

    it('should include contact name placeholder in all templates', () => {
      const templateTypes = [
        'offer',
        'invoice',
        'quote_request',
        'shipment_notification',
        'booking_confirmation',
        'general_message',
      ] as const

      templateTypes.forEach((type) => {
        const template = getDefaultTemplate(type)
        expect(template.html).toContain('{{contactName}}')
      })
    })
  })
})
