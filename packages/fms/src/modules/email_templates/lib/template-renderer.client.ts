/**
 * Client-safe template rendering utilities
 * These functions can be safely imported in client components ("use client")
 * They do NOT import any server-side dependencies (mikro-orm, commands, etc.)
 */

type TemplateVariables = Record<string, unknown>

export type EmailSettings = {
  companyName?: string | null
  companyLogoUrl?: string | null
  primaryColor?: string
  accentColor?: string
  contactEmail?: string | null
  contactPhone?: string | null
  websiteUrl?: string | null
  footerText?: string | null
  footerDisclaimer?: string | null
}

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Converts basic markdown to HTML
 * Handles: headers, bold, italic, line breaks, lists
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown
    // Headers (must come before line break conversion)
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Unordered lists (basic)
    .replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>')
    // Line breaks (but not after block elements)
    .replace(/\n(?!<\/?(h[1-6]|li|ul|ol|p|div))/g, '<br>\n')

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/(<li>.*<\/li>(\s*<br>\s*)?)+/g, (match) => {
    const cleanedMatch = match.replace(/<br>\s*/g, '\n')
    return `<ul>${cleanedMatch}</ul>`
  })

  return html
}

/**
 * Renders a template string by replacing {{variableName}} with values from the variables object
 * Also supports {{#if variable}}...{{/if}} conditionals and {{#each array}}...{{/each}} loops
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  let rendered = template

  // Handle {{#each array}}...{{/each}} loops
  rendered = rendered.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
    const array = variables[key]
    if (!Array.isArray(array) || array.length === 0) {
      return ''
    }
    
    return array.map((item: unknown, index: number) => {
      let itemContent = content
      
      // Replace {{this}} with the item itself (for primitive arrays)
      itemContent = itemContent.replace(/\{\{this\}\}/g, String(item))
      
      // Replace {{@index}} with the current index
      itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index))
      
      // Replace {{propertyName}} with item properties (for object arrays)
      if (typeof item === 'object' && item !== null) {
        const itemObj = item as Record<string, unknown>
        itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (m: string, prop: string) => {
          return itemObj[prop] !== undefined && itemObj[prop] !== null ? String(itemObj[prop]) : m
        })
      }
      
      return itemContent
    }).join('')
  })

  // Handle {{#if variable}}...{{/if}} conditionals
  rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    const value = variables[key]
    // Show content if value exists and is truthy
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
 * Builds the default email HTML wrapper with branding and layout
 */
function buildEmailWrapper(
  content: string,
  options: EmailSettings
): string {
  const {
    companyName = 'Open Mercato',
    companyLogoUrl,
    primaryColor = '#1a365d',
    accentColor = '#f7fafc',
    contactEmail,
    contactPhone,
    websiteUrl,
    footerText,
    footerDisclaimer,
  } = options

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
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: ${primaryColor};
      color: #ffffff;
      padding: 20px;
      text-align: center;
    }
    .header img {
      max-width: 200px;
      height: auto;
    }
    .header h1 {
      margin: 10px 0 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px 20px;
    }
    .details {
      background: ${accentColor};
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .details-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .details-label {
      color: #718096;
      font-weight: 500;
    }
    .details-value {
      font-weight: 600;
      color: #2d3748;
    }
    .message {
      background: #fff;
      border-left: 4px solid ${primaryColor};
      padding: 15px;
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      background-color: ${primaryColor};
      color: #ffffff;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 10px 0;
    }
    .footer {
      background-color: #f7fafc;
      color: #718096;
      font-size: 12px;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer-links {
      margin: 10px 0;
    }
    .footer-links a {
      color: ${primaryColor};
      text-decoration: none;
      margin: 0 10px;
    }
    .disclaimer {
      margin-top: 15px;
      font-size: 11px;
      color: #a0aec0;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      ${companyLogoUrl ? `<img src="${escapeHtml(companyLogoUrl)}" alt="${escapeHtml(companyName)}">` : `<h1>${escapeHtml(companyName)}</h1>`}
    </div>
    
    <div class="content">
      ${content}
    </div>
    
    <div class="footer">
      ${
        contactEmail || contactPhone || websiteUrl
          ? `
      <div class="footer-links">
        ${contactEmail ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>` : ''}
        ${contactPhone ? `<span>${escapeHtml(contactPhone)}</span>` : ''}
        ${websiteUrl ? `<a href="${escapeHtml(websiteUrl)}">${escapeHtml(websiteUrl)}</a>` : ''}
      </div>
      `
          : ''
      }
      ${footerText ? `<p>${escapeHtml(footerText)}</p>` : ''}
      ${
        footerDisclaimer
          ? `<p class="disclaimer">${escapeHtml(footerDisclaimer)}</p>`
          : '<p class="disclaimer">This email was sent from an automated system. Please do not reply directly to this email.</p>'
      }
    </div>
  </div>
</body>
</html>
`.trim()
}

/**
 * Build complete email HTML from markdown content (for client-side preview)
 * Converts markdown to HTML and wraps in branded email layout
 */
export function buildEmailHtml(
  markdownContent: string,
  variables: TemplateVariables,
  settings: EmailSettings
): string {
  // Render variables in content
  const renderedMarkdown = renderTemplate(markdownContent, variables)
  // Convert markdown to HTML
  const htmlContent = markdownToHtml(renderedMarkdown)
  // Wrap in email layout
  return buildEmailWrapper(htmlContent, settings)
}
