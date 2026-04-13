# KSeF Invoice Types (`RodzajFaktury`)

Reference guide for the seven FA(3) invoice variants supported by the KSeF
module. Use this when you touch the invoice form, validator, XML builder, or
any code path that depends on which RodzajFaktury is being processed.

Scope of coverage:

- **Data model**: `packages/ksef/src/modules/ksef/data/entities.ts`
- **Validators**: `packages/ksef/src/modules/ksef/data/validators.ts`
- **XML builder**: `packages/ksef/src/modules/ksef/lib/xml-builder.ts`
- **XML service**: `packages/ksef/src/modules/ksef/services/xml.service.ts`
- **Create form**: `packages/ksef/src/modules/ksef/backend/ksef/invoices/create/page.tsx`
- **Detail page**: `packages/ksef/src/modules/ksef/backend/ksef/invoices/[id]/page.tsx`
- **CRUD API**: `packages/ksef/src/modules/ksef/api/invoices/route.ts` + `[id]/route.ts`
- **Unit tests**: `packages/ksef/src/modules/ksef/lib/__tests__/xml-builder.test.ts`
- **XSD tests**: `packages/ksef/src/modules/ksef/lib/__tests__/xml-builder.xsd.test.ts` — real-schema validation using `xmllint-wasm`
- **Authoritative XSD**: `schemat_FA(3)_v1-0E.xsd` — a frozen copy lives at
  `packages/ksef/src/modules/ksef/lib/__tests__/fixtures/fa3/schemat_FA_3_v1-0E.xsd`
  (upstream: [CIRFMF/ksef-docs](https://github.com/CIRFMF/ksef-docs) →
  `faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd`). If you change the XML
  builder, **run the XSD test** — it will catch any structural drift.

The `RodzajFaktury` element is **mandatory** for every invoice submitted to
KSeF. It determines which FA(3) blocks are emitted, which database columns
are populated, which form sections are rendered, and which validator rules
fire. Never remove a type from the enum — it's a contract surface.

## Type matrix

| Block / Column | VAT | KOR | ZAL | ROZ | UPR | KOR_ZAL | KOR_ROZ |
|---|---|---|---|---|---|---|---|
| `FaWiersz` (line items) | required | optional* | optional | required | required | optional | required |
| `Zamowienie` | — | — | **required** | — | — | **required** | — |
| `DaneFaKorygowanej` | — | **required** | — | — | — | **required** | **required** |
| `FakturaZaliczkowa` refs | — | — | optional (final) | **required** | — | optional | optional |
| `PrzyczynaKorekty` | — | **required** | — | — | — | **required** | **required** |
| `TypKorekty` | — | **required** (1/2/3) | — | — | — | **required** | **required** |
| Buyer `Nazwa` + `Adres` | required | required | required | required | **omitted** | required | required |
| `P_15` ≤ 450 PLN | — | — | — | — | **enforced** | — | — |
| `WartoscZamowienia` | — | — | **required** | — | — | if corrected | — |

*KOR line items are optional for collective/header-only corrections.

## Shared mechanics

**Annotation flags** (`Adnotacje`) are stored as boolean columns on
`ksef_invoices` (`annot_cash_accounting`, `annot_self_billing`,
`annot_reverse_charge`, `annot_split_payment`,
`annot_intra_community_supply`, `annot_export_of_services`,
`annot_new_transport_means`). The XML builder maps each boolean to FA(3)
flag values (`1` = yes, `2` = no).

**VAT totals** are emitted as `P_13_x` (net per rate) + matching `P_14_x`
(VAT per rate) for the first five rate slots. Slots 6_1 through 11 are
**net-only** and have no `P_14` counterpart in the FA(3) v1-0E schema — do
not add one. For foreign-currency invoices, the builder additionally emits
`P_14_xW` fields with the PLN-converted VAT amount, using the stored
`exchange_rate` column.

### Rate → `P_13_x` slot mapping

This is the exact mapping the builder uses, lifted from the FA(3) v1-0E XSD:

| VAT rate / code | Net slot | VAT slot | `P_14_*W` (foreign currency) | Notes |
|---|---|---|---|---|
| `23` / `22` | `P_13_1` | `P_14_1` | `P_14_1W` | Standard rate |
| `8` / `7` | `P_13_2` | `P_14_2` | `P_14_2W` | Reduced 1 |
| `5` | `P_13_3` | `P_14_3` | `P_14_3W` | Reduced 2 |
| `4` / `3` | `P_13_4` | `P_14_4` | `P_14_4W` | Taxi ryczałt |
| OSS (chapter 6a) | `P_13_5` | `P_14_5` | — | Special procedure |
| `0 KR` | `P_13_6_1` | — | — | 0% domestic (default for bare `0`) |
| `0 WDT` | `P_13_6_2` | — | — | 0% intra-EU supply |
| `0 EX` | `P_13_6_3` | — | — | 0% export |
| `zw` | `P_13_7` | — | — | Exempt |
| `np I` (alias `np`) | `P_13_8` | — | — | Services outside Poland, non-art.100 |
| `np II` | `P_13_9` | — | — | Services art. 100 ust. 1 pkt 4 |
| `oo` | `P_13_10` | — | — | Reverse charge |
| margin procedure | `P_13_11` | — | — | Art. 119/art. 120 |

**Accepted `P_12` literal values** on each `FaWiersz` (from `TStawkaPodatku`
in the XSD): `23`, `22`, `8`, `7`, `5`, `4`, `3`, `0 KR`, `0 WDT`, `0 EX`,
`zw`, `oo`, `np I`, `np II`.

Unrecognized input (e.g. a made-up `45`) is silently dropped from `P_12` —
the element is `minOccurs="0"` so the invoice will still validate, but the
rate group will not land in any `P_13_x` bucket. Check your rate code
against the table above before changing.

**Line item sign convention (KOR)**: rows flagged with `isPreState = true`
are written to the XML with opposite sign, carry a `<StanPrzed>1</StanPrzed>`
child element, and are subtracted from the VAT summary. Use this for the
two-row StanPrzed correction method.

**Correction references**: `corrected_ksef_number` is preferred. Only fall
back to `corrected_invoice_number` when the original invoice was issued
pre-mandate (before KSeF). The XML service still honours the legacy
`corrected_invoice_id` UUID on older records by resolving it to a KSeF number
at generation time.

## VAT — Standard invoice

**When**: regular sale of goods or services (B2B domestic, exports,
intra-EU supplies). This is the default `invoiceType` and the baseline
against which every other type is defined.

**Required form/DB fields**: invoice number, issue date, service date (or
period), seller identity + address, buyer identity + address, ≥1 line item,
gross amount, currency, payment method.

**XML layout (within `<Fa>`)**:
```
<KodWaluty>…</KodWaluty>
<P_1>…</P_1>              <!-- issue date -->
<P_2>…</P_2>              <!-- invoice number -->
<P_6>…</P_6>              <!-- service date (optional) -->
<P_13_6_1>…</P_13_6_1>    <!-- net 23%/22% -->
<P_14_6_1>…</P_14_6_1>    <!-- VAT 23%/22% -->
…                         <!-- other rates as present -->
<P_15>…</P_15>            <!-- total gross -->
<Adnotacje>…</Adnotacje>
<RodzajFaktury>VAT</RodzajFaktury>
<FaWiersz>…</FaWiersz>    <!-- repeat per line item -->
<Platnosc>…</Platnosc>
```

**Form behaviour**: all sections visible, no conditional blocks.

## KOR — Corrective invoice

**When**: correcting a previously issued VAT or UPR invoice — wrong price,
quantity, VAT rate, granting rebates, etc.

**Wrong buyer NIP rule**: you **cannot** edit the NIP in place. Issue a
zeroing KOR to the incorrect NIP and a fresh VAT invoice to the correct NIP.
The form disables NIP editing when `editId && isCorrection`.

**Validator rules** (`applyInvoiceTypeRules`):
- `correctionReason` (`PrzyczynaKorekty`) is required.
- Either `correctedKsefNumber` or `correctedInvoiceNumber` must be present.
- `correctionEffectType`, when provided, must be `1` (period of the original),
  `2` (current period), or `3` (other date / per-line dates — FA(3) only).

**Data model fields used**:
- `corrected_ksef_number` → `<NrKSeFFaKorygowanej>` (with `<NrKSeF>1</NrKSeF>` marker)
- `corrected_invoice_number` → `<NrFaKorygowanej>` (seller's own original number)
- `corrected_invoice_issue_date` → `<DataWystFaKorygowanej>`
- `correction_reason` → `<PrzyczynaKorekty>`
- `correction_effect_type` → `<TypKorekty>`
- `correction_period` → `<OkresFaKorygowanej>`

**XML layout** (after `<RodzajFaktury>KOR</RodzajFaktury>`). The KSeF 2.0
FA(3) schema requires `PrzyczynaKorekty` + `TypKorekty` **before**
`DaneFaKorygowanej`, and the corrected-invoice reference is a `choice`
between `(NrKSeF + NrKSeFFaKorygowanej)` (when the original lives in KSeF)
or a single `NrKSeFN` flag (when it was issued outside KSeF):

```xml
<RodzajFaktury>KOR</RodzajFaktury>
<PrzyczynaKorekty>Błędna ilość</PrzyczynaKorekty>
<TypKorekty>2</TypKorekty>
<DaneFaKorygowanej>
  <DataWystFaKorygowanej>2026-02-28</DataWystFaKorygowanej>
  <NrFaKorygowanej>FV/2026/02/015</NrFaKorygowanej>
  <!-- When the original is in KSeF: -->
  <NrKSeF>1</NrKSeF>
  <NrKSeFFaKorygowanej>7980332920-20260228-ABCDEFABCDEF-A1</NrKSeFFaKorygowanej>
  <!-- When the original is pre-KSeF, use this branch instead: -->
  <!-- <NrKSeFN>1</NrKSeFN> -->
</DaneFaKorygowanej>
<OkresFaKorygowanej>2026-02</OkresFaKorygowanej>
```

**KSeF number format** (`TNumerKSeF`): `NIP-YYYYMMDD-XXXXXXXXXXXX-XX` — NIP
prefix (or the special `M<9 digits>` / `<3 uppercase>[7 digits]` markers),
the invoicing date, 12 hexadecimal characters, and a 2-hex-digit checksum.
Fake identifiers that don't match this pattern will fail XSD validation.

**Correction methods**:
1. **Difference method (recommended)** — enter delta values directly on
   `FaWiersz`. No pre-state rows. Net/VAT totals will be the deltas.
2. **StanPrzed method** — two rows per corrected line: one with
   `isPreState = true` (shown orange in the form, written with opposite
   sign + `<StanPrzed>1</StanPrzed>`), one with the new values. Use this
   when the VAT rate changes.
3. **Attachment-based** — not currently surfaced by the form.

**VAT settlement timing**:
- In-minus corrections (created via KSeF) → settled in the period when
  KSeF assigns the number.
- In-plus corrections → settled in the period when the cause arose.

## ZAL — Advance payment invoice

**When**: documenting receipt of a full or partial payment **before**
delivery. Also used as the "last advance" closing a transaction when
advances cumulatively cover 100% of the order.

**Unique structure — `Zamowienie`**: ZAL does *not* primarily describe what
was sold via `FaWiersz`. Instead it describes the whole order in a
`<Zamowienie>` block containing `<WartoscZamowienia>` (total order gross)
and one or more `<ZamowienieWiersz>` child rows. The `FaWiersz` element is
optional on ZAL.

**Data model**:
- `advance_amount` — what the buyer paid. Populates `<P_15>` on ZAL.
- `order_total_gross` — full order gross, populates `<WartoscZamowienia>`.
- `is_final_advance` — flag; when true, the invoice must also carry
  `<FakturaZaliczkowa>` references to every prior advance.
- `ksef_invoice_order_lines` child table — one row per `<ZamowienieWiersz>`.
  Columns: `description` (`P_7Z`), `unit` (`P_8AZ`), `quantity` (`P_8BZ`),
  `net_amount` (`P_11NettoZ`), `vat_amount` (`P_11VatZ`), `vat_rate` (`P_12Z`).

**Validator rules**:
- `orderTotalGross > 0`
- `advanceAmount > 0` and `advanceAmount ≤ orderTotalGross`
- ≥1 order line
- `isFinalAdvance = true` → ≥1 `advanceRefs` entry

**XML layout**:
```
<P_15>{{advanceAmount}}</P_15>          <!-- NOT grossAmount -->
…
<RodzajFaktury>ZAL</RodzajFaktury>
<!-- optional on final advance: -->
<FakturaZaliczkowa>…</FakturaZaliczkowa>
<Zamowienie>
  <WartoscZamowienia>1230.00</WartoscZamowienia>
  <ZamowienieWiersz>
    <NrWierszaZam>1</NrWierszaZam>
    <P_7Z>Transport …</P_7Z>
    <P_8AZ>szt.</P_8AZ>
    <P_8BZ>1</P_8BZ>
    <P_11NettoZ>1000.00</P_11NettoZ>
    <P_11VatZ>230.00</P_11VatZ>
    <P_12Z>23</P_12Z>
  </ZamowienieWiersz>
</Zamowienie>
```

**Same-month advance + delivery**: if the advance is received in the same
month as the delivery, the taxpayer may issue a single VAT invoice instead
of a ZAL + ROZ pair. The module does not enforce this — it's a business
decision left to the user.

## ROZ — Final settlement invoice

**When**: issued after delivery when prior ZAL invoices did not cover 100%
of the transaction. Settles the remaining net + VAT.

**Relationship to ZAL**:
- Net on ROZ = total transaction net – Σ advance nets
- VAT on ROZ = total transaction VAT – Σ advance VATs
- If ZALs cover 100%, **no ROZ is needed** — the final ZAL closes the deal.

**Data model**: uses the `ksef_invoice_advance_refs` child table (one row
per referenced prior advance). Each row carries either `ksef_number`
(preferred) or `invoice_number` (legacy) plus an optional `issue_date` and
`advance_amount`. The date + amount are kept for our own bookkeeping —
**the FA(3) `FakturaZaliczkowa` element only carries the reference**, it
has no child elements for the issue date or the paid amount.

**Validator rule**: ROZ must have ≥1 advance reference.

**XML layout** (after `<RodzajFaktury>ROZ</RodzajFaktury>`). The FA(3)
`FakturaZaliczkowa` element is a pure `choice` between
`(NrKSeFZN + NrFaZaliczkowej)` and `NrKSeFFaZaliczkowej`:

```xml
<!-- prior advance issued in KSeF: -->
<FakturaZaliczkowa>
  <NrKSeFFaZaliczkowej>7980332920-20260201-BBBBBBBBBBBB-B2</NrKSeFFaZaliczkowej>
</FakturaZaliczkowa>
<!-- prior advance issued outside KSeF: -->
<FakturaZaliczkowa>
  <NrKSeFZN>1</NrKSeFZN>
  <NrFaZaliczkowej>FV/2026/03/007</NrFaZaliczkowej>
</FakturaZaliczkowa>
```

Do **not** add `DataWystFaZaliczkowej` or `KwotaZaliczki` children —
neither exists in the FA(3) v1-0E schema and the XSD test will reject them.

Line items on ROZ are standard `FaWiersz` showing the *remaining* amounts
after deducting advances — the form does **not** auto-calculate these; the
user enters them.

## UPR — Simplified invoice

**When**: retail-style transactions where the **total gross ≤ 450 PLN**
(or €100 equivalent). Per Art. 106e(5)(3) of the VAT Act.

**Validator rules**:
- `currencyCode` must be `PLN`.
- `grossAmount ≤ 450`.
- Buyer NIP is still required.

**XML simplification**: the buyer `Nazwa` and `Adres` elements are
suppressed on UPR. The builder keeps `<NIP>` / `<KodUE>` / `<NrVatUE>` and
the required `<JST>` + `<GV>` flags. See `buildBuyer()`.

**Restrictions**:
- Cannot be used for intra-community supplies, distance selling, or to
  unregistered consumers without NIP.
- Cannot be used for self-billing.
- Corrections go through regular `KOR` (not a dedicated `KOR_UPR`).

**Form behaviour**: name + address + country inputs are hidden; the header
area shows a warning strip with the running gross vs. the 450 PLN cap
(turns red when exceeded).

## KOR_ZAL — Corrective advance invoice

**When**: correcting a previously issued ZAL.

**Rules**: combines KOR + ZAL. Requires:
- All KOR fields (`correctionReason`, one of `correctedKsefNumber` /
  `correctedInvoiceNumber`, `correctionEffectType`).
- All ZAL fields (`advanceAmount`, `orderTotalGross`, ≥1 order line).

**Common scenarios**: advance returned, order quantity changed, VAT rate
corrected. The `Zamowienie` section may need to reflect the updated order.

**XML**: emits both the `DaneFaKorygowanej` block and the `Zamowienie`
block. Line items (`FaWiersz`) remain optional.

## KOR_ROZ — Corrective settlement invoice

**When**: correcting a previously issued ROZ.

**Rules**: combines KOR + ROZ. Requires:
- All KOR fields.
- ≥1 prior advance reference in `advanceRefs` (to preserve context of the
  original settlement).

**XML**: emits `DaneFaKorygowanej` + `FakturaZaliczkowa` entries +
`FaWiersz` lines with delta amounts.

## Platform rules that apply across all types

1. **Immutability**: once KSeF accepts an invoice and assigns a KSeF
   number, it cannot be edited or deleted. The only remedy is a corrective
   invoice. The form disables edit/delete buttons once the linked
   `ksef_submissions.status` leaves the `none`/`error`/`cancelled` set.
2. **Noty korygujące abolished** (from 2026-02-01): all corrections flow
   through KOR / KOR_ZAL / KOR_ROZ.
3. **Pro-forma invoices are NOT supported** — they are not VAT documents.
4. **VAT in PLN**: regardless of transaction currency, VAT amounts must be
   expressed in PLN. The builder emits `P_14_*W` fields populated from
   `exchange_rate × VAT` when `currencyCode ≠ PLN`.
5. **KSeF validates XML structure, not arithmetic**. The app is responsible
   for making sure totals add up. The form auto-calculates line VAT and the
   per-rate breakdown; per-type validators enforce the type-specific
   invariants.
6. **Invoice number `P_2`**: sequential within the seller's series. KSeF
   additionally assigns its own ID — both numbers coexist on the stored
   `KsefSubmission` record.
7. **Penalties** (active Jan 1 2027): up to 100% of VAT on invoices issued
   outside KSeF during the mandate window. Grace period through end of
   2026.

## Adding a new invoice type (future-proofing)

If a future FA(3) revision introduces a new `RodzajFaktury` value:

1. Extend `INVOICE_TYPE_CODES` in `lib/fa3-schema.ts`.
2. Extend `ksefInvoiceTypeSchema` and the relevant sets
   (`CORRECTION_INVOICE_TYPES`, `ORDER_SECTION_INVOICE_TYPES`,
   `ADVANCE_REF_INVOICE_TYPES`) in `data/validators.ts`.
3. Add the new rules inside `applyInvoiceTypeRules`.
4. Add the new branches in `buildInvoiceData()` inside
   `lib/xml-builder.ts`.
5. Add one fixture test per variant in `lib/__tests__/xml-builder.test.ts`
   **and** an XSD test in `lib/__tests__/xml-builder.xsd.test.ts` — the
   latter will fail immediately if you put a field in the wrong place in
   the Fa sequence or emit an element the XSD doesn't know about.
6. Render the new conditional section in `create/page.tsx` and add the
   read-only view on `[id]/page.tsx`.
7. Document the new type here and update the type matrix at the top.

Do **not** stretch an existing type to cover something it wasn't designed
for — add a new enum value so the form and XML builder can branch cleanly.

## Running the XSD validation suite

```bash
yarn workspace @open-mercato/ksef test
```

The suite includes `xml-builder.xsd.test.ts`, which loads the real
`schemat_FA(3)_v1-0E.xsd` (plus its three base schemas) via
[`xmllint-wasm`](https://www.npmjs.com/package/xmllint-wasm) — a pure-WASM
build of libxml2 — and runs every RodzajFaktury variant through the real
schema. It should stay green on any Node version (no native toolchain
required) and catches structural drift immediately. Treat a red XSD test as
a blocker; the underlying error messages map 1:1 to what KSeF itself would
reject.

If you update the schema fixtures, pull them from upstream
[`CIRFMF/ksef-docs`](https://github.com/CIRFMF/ksef-docs) at
`faktury/schemy/FA/`, then edit the main XSD to change
`schemaLocation="bazowe/StrukturyDanych_v10-0E.xsd"` to
`schemaLocation="StrukturyDanych_v10-0E.xsd"` and drop the three base
schemas next to it (xmllint-wasm's Emscripten FS does not auto-create
subdirectories for `preload` entries).
