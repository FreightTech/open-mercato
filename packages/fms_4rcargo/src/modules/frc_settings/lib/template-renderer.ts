/**
 * Template rendering utilities for offer email templates.
 * Handles Handlebars-like syntax: {{variable}}, {{#each array}}...{{/each}}, {{#if var}}...{{/if}}
 * 
 * @deprecated This file is deprecated. Use the FMS email_templates module instead:
 * - Import from '@open-mercato/fms/modules/email_templates/lib/template-renderer'
 * - Use renderEmail() for full email rendering with settings
 * - Use renderTemplate() and buildEmailHtml() for client-side preview
 * 
 * This file is kept for backward compatibility but will be removed in a future version.
 */

/**
 * Render template with Handlebars-like syntax
 * @deprecated Use renderTemplate from '@open-mercato/fms/modules/email_templates/lib/template-renderer'
 */
export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  let rendered = template

  // Handle {{#each array}}...{{/each}} loops
  rendered = rendered.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
    const array = variables[key]
    if (!Array.isArray(array) || array.length === 0) {
      return ''
    }

    return array
      .map((item, index) => {
        let itemContent = content
        itemContent = itemContent.replace(/\{\{this\}\}/g, String(item))
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index))

        if (typeof item === 'object' && item !== null) {
          itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (m: string, prop: string) => {
            const val = (item as Record<string, unknown>)[prop]
            return val !== undefined && val !== null ? String(val) : m
          })
        }

        return itemContent
      })
      .join('')
  })

  // Handle {{#if variable}}...{{/if}} conditionals
  rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    const value = variables[key]
    if (value && value !== '' && value !== 'false' && value !== '0') {
      return content
    }
    return ''
  })

  // Handle {{variable}} replacements
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key]
    return value !== undefined && value !== null ? String(value) : match
  })

  return rendered
}

/**
 * Build styled email HTML wrapper with 4R Cargo branding
 * @deprecated Use buildEmailHtml from '@open-mercato/fms/modules/email_templates/lib/template-renderer'
 * which supports configurable branding via EmailSettings.
 */
export function buildEmailHtml(content: string): string {
  // Convert markdown to basic HTML (simplified)
  let html = content
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #333;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #9565f5 0%, #7c3aed 100%);
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px 20px;
    }
    .content h1, .content h2, .content h3 {
      color: #1a1a1a;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    .content h1 { font-size: 20px; }
    .content h2 { font-size: 18px; }
    .content h3 { font-size: 16px; }
    .footer {
      background-color: #f7fafc;
      color: #718096;
      font-size: 12px;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      border-radius: 0 0 8px 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background-color: #f7fafc;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>4R Cargo</h1>
    </div>
    <div class="content">
      ${html}
    </div>
    <div class="footer">
      <p>4R Cargo - Air Freight Solutions</p>
      <p>This email was generated from a template</p>
    </div>
  </div>
</body>
</html>
`.trim()
}

/**
 * Convert rendered content to plain text
 * Strips HTML, converts markdown to readable text
 * @deprecated This function has 4R Cargo hardcoded branding. Consider using a generic
 * plain text converter or implementing a configurable version.
 */
export function buildPlainText(content: string): string {
  let text = content

  // Convert markdown headers to plain text with separators
  text = text.replace(/^### (.*$)/gim, '\n$1\n' + '-'.repeat(20))
  text = text.replace(/^## (.*$)/gim, '\n$1\n' + '='.repeat(30))
  text = text.replace(/^# (.*$)/gim, '\n$1\n' + '='.repeat(40))

  // Remove markdown bold/italic markers
  text = text.replace(/\*\*(.*?)\*\*/g, '$1')
  text = text.replace(/\*(.*?)\*/g, '$1')

  // Normalize whitespace
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()

  // Add header and footer
  return `
4R CARGO - Air Freight Solutions
${'='.repeat(40)}

${text}

${'='.repeat(40)}
4R Cargo - Air Freight Solutions
This email was generated from a template
`.trim()
}
