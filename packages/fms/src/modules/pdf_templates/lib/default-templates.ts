import type { PdfTemplateType } from '../data/entities'

export interface DefaultTemplate {
  htmlTemplate: string
  cssStyles: string
}

/**
 * Default CSS styles - INF-style layout with float-based positioning
 */
export const DEFAULT_CSS = `
/* Reset and base styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.5;
  color: #2d3748;
}

/* Page layout - body content inside Puppeteer margins (header/footer handled by Puppeteer) */
.page {
  padding: 20px 40px 10px 40px;
  page-break-after: always;
}

.page:last-child {
  page-break-after: auto;
}

/* Cover page - full bleed image, separate PDF page with no margins */
.cover-page {
  page-break-after: always;
  padding: 0;
  margin: 0;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Inline header (visible on screen preview; hidden in print since Puppeteer header is used) */
.header {
  overflow: hidden;
  margin-bottom: 15px;
}

.header-title {
  float: left;
  font-size: 18pt;
  font-weight: bold;
  color: {{primaryColor}};
}

.company-logo {
  float: right;
  max-width: 150px;
  max-height: 50px;
  object-fit: contain;
}

.header-line {
  clear: both;
  border-bottom: 1px solid #cbd5e0;
  margin-bottom: 20px;
}

/* Client section */
.client-section {
  margin-bottom: 15px;
}

.client-label {
  font-size: 9pt;
  font-weight: bold;
  color: {{primaryColor}};
  text-transform: uppercase;
  margin-bottom: 5px;
}

.client-name {
  font-size: 11pt;
  font-weight: bold;
  color: #2d3748;
  margin-bottom: 3px;
}

.client-detail {
  font-size: 9pt;
  color: #4a5568;
  margin-bottom: 2px;
}

/* Details section - two columns */
.details-section {
  overflow: hidden;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e2e8f0;
}

.details-left {
  float: left;
  width: 48%;
}

.details-right {
  float: right;
  width: 48%;
}

.detail-row {
  margin-bottom: 8px;
  font-size: 9pt;
}

.detail-label {
  color: #718096;
  display: inline-block;
  min-width: 110px;
}

.detail-value {
  font-weight: 600;
  color: #2d3748;
}

/* Route sections */
.route-section {
  margin-bottom: 25px;
  clear: both;
}

.route-header {
  font-size: 12pt;
  font-weight: bold;
  color: {{primaryColor}};
  margin-bottom: 10px;
  padding-left: 28px;
  position: relative;
}

/* Transport mode emoji icons */
.route-header.mode-sea::before,
.route-header.mode-air::before,
.route-header.mode-road::before,
.route-header.mode-rail::before,
.route-header.mode-barge::before {
  position: absolute;
  left: 0;
  top: 0;
  font-size: 16pt;
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif;
}

.route-header.mode-sea::before {
  content: '🚢';
}

.route-header.mode-air::before {
  content: '✈️';
}

.route-header.mode-road::before {
  content: '🚛';
}

.route-header.mode-rail::before {
  content: '🚂';
}

.route-header.mode-barge::before {
  content: '🚤';
}

/* Route table */
.route-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}

.route-table thead {
  border-top: 3px solid {{primaryColor}};
  background-color: #f7fafc;
}

.route-table th {
  padding: 8px 6px;
  text-align: left;
  font-size: 8pt;
  font-weight: 600;
  color: #4a5568;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.route-table td {
  padding: 8px 6px;
  border-bottom: 1px solid #e2e8f0;
  color: #2d3748;
}

.route-table tbody tr:last-child td {
  border-bottom: 1px solid #cbd5e0;
}

.route-table .text-right {
  text-align: right;
}

.route-table .text-center {
  text-align: center;
}

.route-table .bold {
  font-weight: 600;
}

/* Notes section (footer page) */
.notes-section {
  overflow: hidden;
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e2e8f0;
}

.notes-left {
  float: left;
  width: 48%;
}

.notes-right {
  float: right;
  width: 48%;
}

.notes-heading {
  font-size: 10pt;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 8px;
}

.notes-text {
  font-size: 9pt;
  color: #4a5568;
  line-height: 1.5;
}

/* Custom footer area (inline, for screen preview) */
.custom-footer {
  margin-top: 30px;
  clear: both;
}

/* Terms page */
.terms-page {
  padding: 10px 40px;
  page-break-before: always;
}

.terms-content {
  margin-top: 20px;
  font-size: 9pt;
  line-height: 1.6;
  color: #2d3748;
}

.terms-content h3 {
  font-size: 11pt;
  font-weight: bold;
  color: {{primaryColor}};
  margin-bottom: 15px;
}

.terms-content ol {
  margin-left: 20px;
  margin-bottom: 15px;
}

.terms-content li {
  margin-bottom: 8px;
}

.terms-content p {
  margin-bottom: 10px;
}

/* Utility classes */
.text-right { text-align: right; }
.text-center { text-align: center; }
.text-bold { font-weight: bold; }
.text-muted { color: #718096; }
.text-primary { color: {{primaryColor}}; }
.mt-10 { margin-top: 10px; }
.mt-20 { margin-top: 20px; }
.mb-10 { margin-bottom: 10px; }
.mb-20 { margin-bottom: 20px; }

/* Print: hide inline header/footer (Puppeteer native headerTemplate/footerTemplate used instead) */
@media print {
  .header,
  .header-line,
  .custom-footer {
    display: none;
  }
}

/* Screen preview: show inline header on first page, footer at bottom */
@media screen {
  html, body {
    width: 100% !important;
    max-width: 100% !important;
  }

  body {
    display: flex;
    flex-direction: column;
  }

  /* Hide duplicate headers - only show the first page header */
  .page ~ .page .header,
  .page ~ .page .header-line,
  .terms-page .header,
  .terms-page .header-line {
    display: none;
  }
}
`

/**
 * Default HTML templates for each PDF type
 */
export const DEFAULT_TEMPLATES: Record<PdfTemplateType, DefaultTemplate> = {
  offer: {
    cssStyles: DEFAULT_CSS,
    htmlTemplate: `
{{#if coverPageImageUrl}}
<!-- Cover Page (full-bleed, no header/footer - Puppeteer headerTemplate/footerTemplate
     are hidden on the cover page via the "cover-page" class marker) -->
<div class="cover-page">
  <img src="{{coverPageImageUrl}}" class="cover-image" alt="Cover" />
</div>
{{/if}}

<!-- Main Content Page -->
<div class="page">
  <!-- Inline header (visible on screen preview only; hidden in print by CSS) -->
  <div class="header">
    <div class="header-title">{{labelOffer}} - {{offerNumber}}</div>
    {{#if companyLogoUrl}}
    <img src="{{companyLogoUrl}}" class="company-logo" alt="{{companyName}}" />
    {{/if}}
  </div>
  <div class="header-line"></div>

  <!-- Client Section -->
  <div class="client-section">
    <div class="client-label">{{labelClient}}</div>
    <div class="client-name">{{clientName}}</div>
    {{#if clientAddress}}
    <div class="client-detail">{{clientAddress}}</div>
    {{/if}}
    {{#if clientTaxId}}
    <div class="client-detail">{{labelTaxId}}: {{clientTaxId}}</div>
    {{/if}}
  </div>

  <!-- Details Section - Two Columns -->
  <div class="details-section">
    <div class="details-left">
      {{#if incoterms}}
      <div class="detail-row">
        <span class="detail-label">{{labelIncoterms}}:</span>
        <span class="detail-value">{{incoterms}}</span>
      </div>
      {{/if}}
      {{#if validUntil}}
      <div class="detail-row">
        <span class="detail-label">{{labelValidity}}:</span>
        <span class="detail-value">{{validUntil}}</span>
      </div>
      {{/if}}
      {{#if paymentTerms}}
      <div class="detail-row">
        <span class="detail-label">{{labelPaymentTerms}}:</span>
        <span class="detail-value">{{paymentTerms}}</span>
      </div>
      {{/if}}
    </div>
    <div class="details-right">
      {{#if cargoDescription}}
      <div class="detail-row">
        <span class="detail-label">{{labelCargo}}:</span>
        <span class="detail-value">{{cargoDescription}}</span>
      </div>
      {{/if}}
      {{#if cargoType}}
      <div class="detail-row">
        <span class="detail-label">{{labelCargoType}}:</span>
        <span class="detail-value">{{cargoType}}</span>
      </div>
      {{/if}}
      <div class="detail-row">
        <span class="detail-label">{{labelCurrency}}:</span>
        <span class="detail-value">{{currencyCode}}</span>
      </div>
    </div>
  </div>

  <!-- Route Sections -->
  {{#each routes}}
  <div class="route-section">
    <div class="route-header {{transportModeClass}}">{{routeLabel}}</div>
    <table class="route-table">
      <thead>
        <tr>
          <th style="width: 5%">{{labelLineNumber}}</th>
          <th style="width: 40%">{{labelName}}</th>
          <th style="width: 10%">{{labelCurrencyCol}}</th>
          <th style="width: 12%">{{labelFeeScope}}</th>
          <th style="width: 8%" class="text-center">{{labelQuantity}}</th>
          <th style="width: 12%" class="text-right">{{labelRate}}</th>
          <th style="width: 13%" class="text-right">{{labelTotal}}</th>
        </tr>
      </thead>
      <tbody>
        {{#each lines}}
        <tr>
          <td>{{lineNumber}}</td>
          <td>{{productName}}</td>
          <td>{{currencyCode}}</td>
          <td>{{containerSize}}</td>
          <td class="text-center">{{quantity}}</td>
          <td class="text-right">{{unitPrice}}</td>
          <td class="text-right bold">{{amount}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </div>
  {{/each}}
</div>

<!-- Notes Page (only if there are customer notes or exchange rates) -->
{{#if customerNotes}}
<div class="page">
  <div class="notes-section">
    <div class="notes-left">
      <div class="notes-heading">{{labelCustomerNotes}}:</div>
      <div class="notes-text">{{customerNotes}}</div>
    </div>
    {{#if exchangeRates}}
    <div class="notes-right">
      <div class="notes-heading">{{labelExchangeRates}}:</div>
      <div class="notes-text">{{exchangeRates}}</div>
    </div>
    {{/if}}
  </div>
</div>
{{else}}{{#if exchangeRates}}
<div class="page">
  <div class="notes-section">
    <div class="notes-left">
      <div class="notes-heading">{{labelExchangeRates}}:</div>
      <div class="notes-text">{{exchangeRates}}</div>
    </div>
  </div>
</div>
{{/if}}{{/if}}

<!-- Terms Page (Rules Agreement) -->
{{#if rulesAgreementHtml}}
<div class="terms-page">
  <div class="terms-content">
    <h3>{{labelTermsTitle}}</h3>
    {{{rulesAgreementHtml}}}
  </div>
</div>
{{/if}}
`,
  },
}

/**
 * Get default template for a PDF type
 */
export function getDefaultTemplate(templateType: PdfTemplateType): DefaultTemplate {
  return DEFAULT_TEMPLATES[templateType]
}
