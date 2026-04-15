/** @jest-environment node */
import {
  extractInvoiceNumberFromFa3,
  extractSellerNipFromFa3,
  extractBuyerNipFromFa3,
  extractInvoiceDateFromFa3,
  extractGrossAmountFromFa3,
  extractLineItemsFromFa3,
  extractSellerNameFromFa3,
  extractBuyerNameFromFa3,
  extractDueDateFromFa3,
  extractCurrencyFromFa3,
  extractPaymentMethodFromFa3,
  parseKsefXmlResponse,
  extractUpoFromXml,
  extractExceptionDetails,
} from '../xml-parser'

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════

/** Minimal FA(3) invoice XML without namespace prefix */
const FA3_PLAIN = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-04-01T10:00:00</DataWytworzeniaFa>
    <SystemInfo>OpenMercato</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>7980332920</NIP>
      <Nazwa>Sprzedawca Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Testowa 1</AdresL1>
      <AdresL2>00-001 Warszawa</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>5261040828</NIP>
      <Nazwa>Kupiec S.A.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Handlowa 5</AdresL1>
      <AdresL2>31-001 Kraków</AdresL2>
    </Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-04-01</P_1>
    <P_2>FV/2026/04/001</P_2>
    <P_13_1>1500.00</P_13_1>
    <P_14_1>345.00</P_14_1>
    <P_15>1845.00</P_15>
    <FormaPlatnosci>6</FormaPlatnosci>
    <TerminPlatnosci>2026-05-01</TerminPlatnosci>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługa transportowa</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>2</P_8B>
      <P_9A>500.00</P_9A>
      <P_11>1000.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
    <FaWiersz>
      <NrWierszaFa>2</NrWierszaFa>
      <P_7>Opakowanie</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>5</P_8B>
      <P_9A>100.00</P_9A>
      <P_11>500.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`

/** Same invoice with tns: namespace prefix (as seen from KSeF downloads) */
const FA3_NAMESPACED = `<?xml version="1.0" encoding="UTF-8"?>
<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <tns:Naglowek>
    <tns:KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</tns:KodFormularza>
    <tns:WariantFormularza>3</tns:WariantFormularza>
    <tns:DataWytworzeniaFa>2026-04-01T10:00:00</tns:DataWytworzeniaFa>
    <tns:SystemInfo>OpenMercato</tns:SystemInfo>
  </tns:Naglowek>
  <tns:Podmiot1>
    <tns:DaneIdentyfikacyjne>
      <tns:NIP>7980332920</tns:NIP>
      <tns:Nazwa>Sprzedawca Sp. z o.o.</tns:Nazwa>
    </tns:DaneIdentyfikacyjne>
    <tns:Adres>
      <tns:KodKraju>PL</tns:KodKraju>
      <tns:AdresL1>ul. Testowa 1</tns:AdresL1>
      <tns:AdresL2>00-001 Warszawa</tns:AdresL2>
    </tns:Adres>
  </tns:Podmiot1>
  <tns:Podmiot2>
    <tns:DaneIdentyfikacyjne>
      <tns:NIP>5261040828</tns:NIP>
      <tns:Nazwa>Kupiec S.A.</tns:Nazwa>
    </tns:DaneIdentyfikacyjne>
    <tns:Adres>
      <tns:KodKraju>PL</tns:KodKraju>
      <tns:AdresL1>ul. Handlowa 5</tns:AdresL1>
      <tns:AdresL2>31-001 Kraków</tns:AdresL2>
    </tns:Adres>
  </tns:Podmiot2>
  <tns:Fa>
    <tns:KodWaluty>PLN</tns:KodWaluty>
    <tns:P_1>2026-04-01</tns:P_1>
    <tns:P_2>FV/2026/04/001</tns:P_2>
    <tns:P_13_1>1500.00</tns:P_13_1>
    <tns:P_14_1>345.00</tns:P_14_1>
    <tns:P_15>1845.00</tns:P_15>
    <tns:FormaPlatnosci>6</tns:FormaPlatnosci>
    <tns:TerminPlatnosci>2026-05-01</tns:TerminPlatnosci>
    <tns:FaWiersz>
      <tns:NrWierszaFa>1</tns:NrWierszaFa>
      <tns:P_7>Usługa transportowa</tns:P_7>
      <tns:P_8A>szt.</tns:P_8A>
      <tns:P_8B>2</tns:P_8B>
      <tns:P_9A>500.00</tns:P_9A>
      <tns:P_11>1000.00</tns:P_11>
      <tns:P_12>23</tns:P_12>
    </tns:FaWiersz>
    <tns:FaWiersz>
      <tns:NrWierszaFa>2</tns:NrWierszaFa>
      <tns:P_7>Opakowanie</tns:P_7>
      <tns:P_8A>szt.</tns:P_8A>
      <tns:P_8B>5</tns:P_8B>
      <tns:P_9A>100.00</tns:P_9A>
      <tns:P_11>500.00</tns:P_11>
      <tns:P_12>23</tns:P_12>
    </tns:FaWiersz>
  </tns:Fa>
</tns:Faktura>`

/** Invoice with ns0: prefix (another common namespace prefix) */
const FA3_NS0 = FA3_NAMESPACED.replace(/tns:/g, 'ns0:')

/** Invoice with a single line item and NazwaHandlowa instead of Nazwa */
const FA3_TRADE_NAME = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1>
    <NazwaHandlowa>FreightTech Logistics</NazwaHandlowa>
    <NIP>1234567890</NIP>
  </Podmiot1>
  <Podmiot2>
    <NazwaHandlowa>INF Shipping</NazwaHandlowa>
    <NIP>0987654321</NIP>
  </Podmiot2>
  <Fa>
    <KodWaluty>EUR</KodWaluty>
    <P_1>2026-03-15</P_1>
    <P_2>INV-2026-003</P_2>
    <P_15>123.00</P_15>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Fracht międzynarodowy</P_7>
      <P_8B>1</P_8B>
      <P_9A>100.00</P_9A>
      <P_11>100.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`

/** Minimal FA(3) with no line items (advance invoice / zaliczkowa) */
const FA3_NO_LINE_ITEMS = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1><NIP>1111111111</NIP><Nazwa>Seller</Nazwa></Podmiot1>
  <Podmiot2><NIP>2222222222</NIP><Nazwa>Buyer</Nazwa></Podmiot2>
  <Fa>
    <P_1>2026-01-10</P_1>
    <P_2>ZAL/2026/01</P_2>
    <P_15>500.00</P_15>
  </Fa>
</Faktura>`

/** Invoice with optional fields missing (no P_9A, no P_8B on some lines) */
const FA3_SPARSE_LINES = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1><NIP>1111111111</NIP><Nazwa>Seller</Nazwa></Podmiot1>
  <Podmiot2><NIP>2222222222</NIP><Nazwa>Buyer</Nazwa></Podmiot2>
  <Fa>
    <P_1>2026-02-20</P_1>
    <P_2>FV/SPARSE</P_2>
    <P_15>200.00</P_15>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Service only description</P_7>
      <P_11>200.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`

/**
 * Correction invoice (faktura korygująca) with Podmiot1K/Podmiot2K sections.
 * Per FA(3) XSD RodzajFaktury=KOR. The parser must not break on these
 * extra sections and must still extract header/line data normally.
 */
const FA3_CORRECTION = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-04-10T14:00:00</DataWytworzeniaFa>
    <SystemInfo>OpenMercato</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>7980332920</NIP>
      <Nazwa>Sprzedawca Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>5261040828</NIP>
      <Nazwa>Kupiec S.A.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-04-10</P_1>
    <P_2>KOR/2026/04/001</P_2>
    <RodzajFaktury>KOR</RodzajFaktury>
    <P_15>-200.00</P_15>
    <Podmiot1K>
      <DaneIdentyfikacyjne>
        <NIP>7980332920</NIP>
        <Nazwa>Stara Nazwa Firmy</Nazwa>
      </DaneIdentyfikacyjne>
    </Podmiot1K>
    <Podmiot2K>
      <DaneIdentyfikacyjne>
        <NIP>5261040828</NIP>
        <Nazwa>Stara Nazwa Klienta</Nazwa>
      </DaneIdentyfikacyjne>
    </Podmiot2K>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Korekta transportu</P_7>
      <P_8B>1</P_8B>
      <P_9A>-200.00</P_9A>
      <P_11>-200.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`

/**
 * Line items with special (non-numeric) P_12 VAT rates.
 * Per FA(3) XSD TStawkaPodatku: "zw" (exempt), "oo" (not subject), "np" (non-taxable).
 * Also includes mixed standard rates (23, 8, 0) and a negative correction line.
 */
const FA3_SPECIAL_VAT_RATES = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1><NIP>1111111111</NIP><Nazwa>Seller</Nazwa></Podmiot1>
  <Podmiot2><NIP>2222222222</NIP><Nazwa>Buyer</Nazwa></Podmiot2>
  <Fa>
    <P_1>2026-03-01</P_1>
    <P_2>FV/VAT/2026</P_2>
    <P_15>1230.00</P_15>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługa zwolniona</P_7>
      <P_8B>1</P_8B>
      <P_9A>500.00</P_9A>
      <P_11>500.00</P_11>
      <P_12>zw</P_12>
    </FaWiersz>
    <FaWiersz>
      <NrWierszaFa>2</NrWierszaFa>
      <P_7>Nie podlega</P_7>
      <P_8B>1</P_8B>
      <P_9A>300.00</P_9A>
      <P_11>300.00</P_11>
      <P_12>oo</P_12>
    </FaWiersz>
    <FaWiersz>
      <NrWierszaFa>3</NrWierszaFa>
      <P_7>Niepodlegający</P_7>
      <P_8B>1</P_8B>
      <P_9A>200.00</P_9A>
      <P_11>200.00</P_11>
      <P_12>np</P_12>
    </FaWiersz>
    <FaWiersz>
      <NrWierszaFa>4</NrWierszaFa>
      <P_7>Stawka 8%</P_7>
      <P_8B>1</P_8B>
      <P_9A>100.00</P_9A>
      <P_11>100.00</P_11>
      <P_12>8</P_12>
    </FaWiersz>
    <FaWiersz>
      <NrWierszaFa>5</NrWierszaFa>
      <P_7>Stawka 0%</P_7>
      <P_8B>10</P_8B>
      <P_9A>13.00</P_9A>
      <P_11>130.00</P_11>
      <P_12>0</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`

/**
 * Buyer identified by EU VAT number (NrVatUE) instead of NIP.
 * Per FA(3) XSD Podmiot2 choice: NIP | NrVatUE | BrakID.
 */
const FA3_BUYER_EU_VAT = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1><NIP>7980332920</NIP><Nazwa>Polish Seller</Nazwa></Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NrVatUE>DE123456789</NrVatUE>
      <Nazwa>German Buyer GmbH</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <P_1>2026-04-05</P_1>
    <P_2>FV/EU/001</P_2>
    <P_15>1000.00</P_15>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Export service</P_7>
      <P_8B>1</P_8B>
      <P_9A>1000.00</P_9A>
      <P_11>1000.00</P_11>
      <P_12>np</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`

/** Buyer identified by BrakID (no identifier — e.g. consumer). */
const FA3_BUYER_NO_ID = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1><NIP>7980332920</NIP><Nazwa>Seller</Nazwa></Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <BrakID>1</BrakID>
      <Nazwa>Osoba Fizyczna</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <P_1>2026-04-06</P_1>
    <P_2>FV/CONS/001</P_2>
    <P_15>50.00</P_15>
  </Fa>
</Faktura>`

/**
 * Payment info inside a <Platnosc> wrapper instead of directly in <Fa>.
 * Both TerminPlatnosci and FormaPlatnosci can appear in either location.
 */
const FA3_PLATNOSC_WRAPPER = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1><NIP>1111111111</NIP><Nazwa>Seller</Nazwa></Podmiot1>
  <Podmiot2><NIP>2222222222</NIP><Nazwa>Buyer</Nazwa></Podmiot2>
  <Fa>
    <P_1>2026-04-01</P_1>
    <P_2>FV/PLAT/001</P_2>
    <P_15>100.00</P_15>
  </Fa>
  <Platnosc>
    <TerminPlatnosci>2026-05-15</TerminPlatnosci>
    <FormaPlatnosci>6</FormaPlatnosci>
  </Platnosc>
</Faktura>`

/**
 * tns: namespaced correction invoice with Podmiot1K/Podmiot2K.
 * Ensures namespace stripping works inside the nested correction sections.
 */
const FA3_CORRECTION_NAMESPACED = `<?xml version="1.0" encoding="UTF-8"?>
<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <tns:Podmiot1>
    <tns:DaneIdentyfikacyjne>
      <tns:NIP>7980332920</tns:NIP>
      <tns:Nazwa>Seller Ltd</tns:Nazwa>
    </tns:DaneIdentyfikacyjne>
  </tns:Podmiot1>
  <tns:Podmiot2>
    <tns:DaneIdentyfikacyjne>
      <tns:NIP>5261040828</tns:NIP>
      <tns:Nazwa>Buyer Inc</tns:Nazwa>
    </tns:DaneIdentyfikacyjne>
  </tns:Podmiot2>
  <tns:Fa>
    <tns:KodWaluty>PLN</tns:KodWaluty>
    <tns:P_1>2026-04-12</tns:P_1>
    <tns:P_2>KOR/NS/001</tns:P_2>
    <tns:P_15>-50.00</tns:P_15>
    <tns:Podmiot1K>
      <tns:DaneIdentyfikacyjne>
        <tns:NIP>7980332920</tns:NIP>
        <tns:Nazwa>Old Seller Name</tns:Nazwa>
      </tns:DaneIdentyfikacyjne>
    </tns:Podmiot1K>
    <tns:FaWiersz>
      <tns:NrWierszaFa>1</tns:NrWierszaFa>
      <tns:P_7>Correction line</tns:P_7>
      <tns:P_11>-50.00</tns:P_11>
      <tns:P_12>23</tns:P_12>
    </tns:FaWiersz>
  </tns:Fa>
</tns:Faktura>`

/**
 * XML with mixed namespace prefixes on different subtrees.
 * Unusual but technically valid. The parser must handle it.
 */
const FA3_MIXED_NS = `<?xml version="1.0" encoding="UTF-8"?>
<a:Faktura xmlns:a="http://crd.gov.pl/wzor/2025/06/25/13775/" xmlns:b="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <a:Podmiot1>
    <b:NIP>9999999999</b:NIP>
    <b:Nazwa>Mixed NS Seller</b:Nazwa>
  </a:Podmiot1>
  <b:Podmiot2>
    <a:NIP>8888888888</a:NIP>
    <a:Nazwa>Mixed NS Buyer</a:Nazwa>
  </b:Podmiot2>
  <a:Fa>
    <b:P_1>2026-06-01</b:P_1>
    <b:P_2>MIX/001</b:P_2>
    <a:P_15>999.00</a:P_15>
    <b:FaWiersz>
      <a:NrWierszaFa>1</a:NrWierszaFa>
      <b:P_7>Mixed item</b:P_7>
      <a:P_11>999.00</a:P_11>
      <b:P_12>23</b:P_12>
    </b:FaWiersz>
  </a:Fa>
</a:Faktura>`

/**
 * XML with attribute values containing colons (e.g. xmlns:tns="...").
 * Verifies that stripNsPrefixes does NOT mangle attribute values.
 */
const FA3_COLON_IN_ATTRS = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/" xsi:schemaLocation="http://crd.gov.pl/wzor/2025/06/25/13775/ schemat_FA_3_v1-0E.xsd">
  <Podmiot1><NIP>1111111111</NIP><Nazwa>Seller</Nazwa></Podmiot1>
  <Podmiot2><NIP>2222222222</NIP><Nazwa>Buyer</Nazwa></Podmiot2>
  <Fa>
    <P_1>2026-07-01</P_1>
    <P_2>FV/ATTR/001</P_2>
    <P_15>100.00</P_15>
  </Fa>
</Faktura>`

/** KSeF API XML response (session/status) */
const KSEF_API_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<ns2:InitialisedSessionResponse xmlns:ns2="http://ksef.mf.gov.pl/schema/gtw/svc/online/types/2021/10/01/0001">
  <ReferenceNumber>20260401-SE-ABC123DEF456</ReferenceNumber>
  <SessionToken>eyJhbGciOiJSUzI1NiJ9.test_token_payload</SessionToken>
  <Timestamp>2026-04-01T10:00:00.000Z</Timestamp>
  <Challenge>CHALLENGE-VALUE-XYZ</Challenge>
</ns2:InitialisedSessionResponse>`

/** Fully namespaced API response (all inner tags also carry ns2:) */
const KSEF_API_RESPONSE_FULL_NS = `<?xml version="1.0" encoding="UTF-8"?>
<ns2:InitialisedSessionResponse xmlns:ns2="http://ksef.mf.gov.pl/schema/gtw/svc/online/types/2021/10/01/0001">
  <ns2:ReferenceNumber>REF-FULL-NS</ns2:ReferenceNumber>
  <ns2:SessionToken>full-ns-token</ns2:SessionToken>
  <ns2:Timestamp>2026-04-02T12:00:00.000Z</ns2:Timestamp>
</ns2:InitialisedSessionResponse>`

/** KSeF UPO response */
const KSEF_UPO_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<GetUpoResponse>
  <Upo>BASE64ENCODEDUPOCONTENT==</Upo>
</GetUpoResponse>`

/** UPO with uppercase tag variant */
const KSEF_UPO_UPPERCASE = `<?xml version="1.0" encoding="UTF-8"?>
<Response><UPO>ALT_BASE64_CONTENT</UPO></Response>`

/** KSeF exception response */
const KSEF_EXCEPTION_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<ExceptionResponse>
  <ExceptionDetail>
    <ExceptionCode>21001</ExceptionCode>
    <ExceptionDescription>Invalid invoice structure</ExceptionDescription>
  </ExceptionDetail>
  <ExceptionDetail>
    <ExceptionCode>21002</ExceptionCode>
    <ExceptionDescription>Missing required field P_2</ExceptionDescription>
  </ExceptionDetail>
</ExceptionResponse>`

/** KSeF duplicate invoice exception (code 440) — per weryfikacja-faktury.md */
const KSEF_DUPLICATE_EXCEPTION = `<?xml version="1.0" encoding="UTF-8"?>
<ExceptionResponse>
  <ExceptionDetail>
    <ExceptionCode>440</ExceptionCode>
    <ExceptionDescription>Duplikat faktury</ExceptionDescription>
  </ExceptionDetail>
</ExceptionResponse>`

/** Helper: build a FA(3) XML with N line items */
function buildFa3WithLines(count: number): string {
  const lines = Array.from({ length: count }, (_, i) => `
    <FaWiersz>
      <NrWierszaFa>${i + 1}</NrWierszaFa>
      <P_7>Item ${i + 1}</P_7>
      <P_8B>1</P_8B>
      <P_9A>10.00</P_9A>
      <P_11>10.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1><NIP>1111111111</NIP><Nazwa>Seller</Nazwa></Podmiot1>
  <Podmiot2><NIP>2222222222</NIP><Nazwa>Buyer</Nazwa></Podmiot2>
  <Fa>
    <P_1>2026-01-01</P_1>
    <P_2>FV/BULK</P_2>
    <P_15>${(count * 10).toFixed(2)}</P_15>
    ${lines}
  </Fa>
</Faktura>`
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('xml-parser', () => {

  // ── Line items ──

  describe('extractLineItemsFromFa3', () => {
    it('parses line items from plain XML', () => {
      const items = extractLineItemsFromFa3(FA3_PLAIN)
      expect(items).toHaveLength(2)
      expect(items[0]).toEqual({
        lineNumber: '1',
        description: 'Usługa transportowa',
        quantity: '2',
        unitPrice: '500.00',
        netAmount: '1000.00',
        vatRate: '23',
      })
      expect(items[1]).toEqual({
        lineNumber: '2',
        description: 'Opakowanie',
        quantity: '5',
        unitPrice: '100.00',
        netAmount: '500.00',
        vatRate: '23',
      })
    })

    it('parses line items from tns: namespaced XML', () => {
      const items = extractLineItemsFromFa3(FA3_NAMESPACED)
      expect(items).toHaveLength(2)
      expect(items[0]!.description).toBe('Usługa transportowa')
      expect(items[0]!.netAmount).toBe('1000.00')
      expect(items[1]!.description).toBe('Opakowanie')
      expect(items[1]!.unitPrice).toBe('100.00')
    })

    it('parses line items from ns0: namespaced XML', () => {
      const items = extractLineItemsFromFa3(FA3_NS0)
      expect(items).toHaveLength(2)
      expect(items[0]!.lineNumber).toBe('1')
      expect(items[1]!.lineNumber).toBe('2')
    })

    it('returns empty array when <Fa> is missing', () => {
      expect(extractLineItemsFromFa3('<Faktura></Faktura>')).toEqual([])
    })

    it('returns empty array for advance invoice with no FaWiersz', () => {
      expect(extractLineItemsFromFa3(FA3_NO_LINE_ITEMS)).toEqual([])
    })

    it('handles sparse line items (missing optional fields)', () => {
      const items = extractLineItemsFromFa3(FA3_SPARSE_LINES)
      expect(items).toHaveLength(1)
      expect(items[0]).toEqual({
        lineNumber: '1',
        description: 'Service only description',
        quantity: null,
        unitPrice: null,
        netAmount: '200.00',
        vatRate: '23',
      })
    })

    it('returns empty array for empty string', () => {
      expect(extractLineItemsFromFa3('')).toEqual([])
    })

    it('returns empty array for garbage input', () => {
      expect(extractLineItemsFromFa3('not xml at all')).toEqual([])
    })

    it('parses correction invoice line items (negative amounts)', () => {
      const items = extractLineItemsFromFa3(FA3_CORRECTION)
      expect(items).toHaveLength(1)
      expect(items[0]!.description).toBe('Korekta transportu')
      expect(items[0]!.unitPrice).toBe('-200.00')
      expect(items[0]!.netAmount).toBe('-200.00')
    })

    it('parses namespaced correction invoice line items', () => {
      const items = extractLineItemsFromFa3(FA3_CORRECTION_NAMESPACED)
      expect(items).toHaveLength(1)
      expect(items[0]!.description).toBe('Correction line')
      expect(items[0]!.netAmount).toBe('-50.00')
    })

    it('handles many line items (100 — stress test)', () => {
      const items = extractLineItemsFromFa3(buildFa3WithLines(100))
      expect(items).toHaveLength(100)
      expect(items[0]!.lineNumber).toBe('1')
      expect(items[0]!.description).toBe('Item 1')
      expect(items[99]!.lineNumber).toBe('100')
      expect(items[99]!.description).toBe('Item 100')
    })

    it('handles maximum line items (500 — large invoice)', () => {
      const items = extractLineItemsFromFa3(buildFa3WithLines(500))
      expect(items).toHaveLength(500)
      expect(items[499]!.lineNumber).toBe('500')
    })

    it('handles mixed namespace prefixes across subtrees', () => {
      const items = extractLineItemsFromFa3(FA3_MIXED_NS)
      expect(items).toHaveLength(1)
      expect(items[0]!.description).toBe('Mixed item')
      expect(items[0]!.netAmount).toBe('999.00')
      expect(items[0]!.vatRate).toBe('23')
    })
  })

  // ── Special VAT rates ──

  describe('special VAT rates (P_12)', () => {
    it('preserves non-numeric VAT rates as strings', () => {
      const items = extractLineItemsFromFa3(FA3_SPECIAL_VAT_RATES)
      expect(items).toHaveLength(5)
      expect(items[0]!.vatRate).toBe('zw')
      expect(items[1]!.vatRate).toBe('oo')
      expect(items[2]!.vatRate).toBe('np')
      expect(items[3]!.vatRate).toBe('8')
      expect(items[4]!.vatRate).toBe('0')
    })

    it('extracts all fields for exempt (zw) items', () => {
      const items = extractLineItemsFromFa3(FA3_SPECIAL_VAT_RATES)
      expect(items[0]).toEqual({
        lineNumber: '1',
        description: 'Usługa zwolniona',
        quantity: '1',
        unitPrice: '500.00',
        netAmount: '500.00',
        vatRate: 'zw',
      })
    })
  })

  // ── Invoice number ──

  describe('extractInvoiceNumberFromFa3', () => {
    it('extracts P_2 from plain XML', () => {
      expect(extractInvoiceNumberFromFa3(FA3_PLAIN)).toBe('FV/2026/04/001')
    })

    it('extracts P_2 from tns: namespaced XML', () => {
      expect(extractInvoiceNumberFromFa3(FA3_NAMESPACED)).toBe('FV/2026/04/001')
    })

    it('extracts P_2 from ns0: namespaced XML', () => {
      expect(extractInvoiceNumberFromFa3(FA3_NS0)).toBe('FV/2026/04/001')
    })

    it('extracts correction invoice number', () => {
      expect(extractInvoiceNumberFromFa3(FA3_CORRECTION)).toBe('KOR/2026/04/001')
    })

    it('returns null when Fa is missing', () => {
      expect(extractInvoiceNumberFromFa3('<Faktura></Faktura>')).toBeNull()
    })

    it('works with colon-containing attributes in the XML', () => {
      expect(extractInvoiceNumberFromFa3(FA3_COLON_IN_ATTRS)).toBe('FV/ATTR/001')
    })
  })

  // ── Invoice date ──

  describe('extractInvoiceDateFromFa3', () => {
    it('extracts P_1 from plain XML', () => {
      expect(extractInvoiceDateFromFa3(FA3_PLAIN)).toBe('2026-04-01')
    })

    it('extracts P_1 from namespaced XML', () => {
      expect(extractInvoiceDateFromFa3(FA3_NAMESPACED)).toBe('2026-04-01')
    })

    it('extracts P_1 from correction invoice', () => {
      expect(extractInvoiceDateFromFa3(FA3_CORRECTION)).toBe('2026-04-10')
    })

    it('returns null when Fa is missing', () => {
      expect(extractInvoiceDateFromFa3('')).toBeNull()
    })
  })

  // ── Gross amount ──

  describe('extractGrossAmountFromFa3', () => {
    it('extracts P_15 from plain XML', () => {
      expect(extractGrossAmountFromFa3(FA3_PLAIN)).toBe('1845.00')
    })

    it('extracts P_15 from namespaced XML', () => {
      expect(extractGrossAmountFromFa3(FA3_NAMESPACED)).toBe('1845.00')
    })

    it('extracts negative P_15 from correction invoice', () => {
      expect(extractGrossAmountFromFa3(FA3_CORRECTION)).toBe('-200.00')
    })

    it('returns null when missing', () => {
      expect(extractGrossAmountFromFa3('')).toBeNull()
    })
  })

  // ── Seller NIP ──

  describe('extractSellerNipFromFa3', () => {
    it('extracts NIP from Podmiot1 in plain XML', () => {
      expect(extractSellerNipFromFa3(FA3_PLAIN)).toBe('7980332920')
    })

    it('extracts NIP from Podmiot1 in namespaced XML', () => {
      expect(extractSellerNipFromFa3(FA3_NAMESPACED)).toBe('7980332920')
    })

    it('extracts NIP even when Podmiot1K exists inside Fa', () => {
      expect(extractSellerNipFromFa3(FA3_CORRECTION)).toBe('7980332920')
    })

    it('returns null when Podmiot1 is missing', () => {
      expect(extractSellerNipFromFa3('<Faktura><Fa></Fa></Faktura>')).toBeNull()
    })

    it('extracts NIP with mixed namespace prefixes', () => {
      expect(extractSellerNipFromFa3(FA3_MIXED_NS)).toBe('9999999999')
    })
  })

  // ── Buyer NIP ──

  describe('extractBuyerNipFromFa3', () => {
    it('extracts NIP from Podmiot2 in plain XML', () => {
      expect(extractBuyerNipFromFa3(FA3_PLAIN)).toBe('5261040828')
    })

    it('extracts NIP from Podmiot2 in namespaced XML', () => {
      expect(extractBuyerNipFromFa3(FA3_NAMESPACED)).toBe('5261040828')
    })

    it('returns null when Podmiot2 is missing', () => {
      expect(extractBuyerNipFromFa3('<Faktura><Podmiot1><NIP>123</NIP></Podmiot1></Faktura>')).toBeNull()
    })

    it('returns null when buyer has NrVatUE instead of NIP', () => {
      expect(extractBuyerNipFromFa3(FA3_BUYER_EU_VAT)).toBeNull()
    })

    it('returns null when buyer has BrakID instead of NIP', () => {
      expect(extractBuyerNipFromFa3(FA3_BUYER_NO_ID)).toBeNull()
    })
  })

  // ── Seller name ──

  describe('extractSellerNameFromFa3', () => {
    it('extracts Nazwa from Podmiot1', () => {
      expect(extractSellerNameFromFa3(FA3_PLAIN)).toBe('Sprzedawca Sp. z o.o.')
    })

    it('extracts Nazwa from namespaced XML', () => {
      expect(extractSellerNameFromFa3(FA3_NAMESPACED)).toBe('Sprzedawca Sp. z o.o.')
    })

    it('falls back to NazwaHandlowa when Nazwa is absent', () => {
      expect(extractSellerNameFromFa3(FA3_TRADE_NAME)).toBe('FreightTech Logistics')
    })

    it('returns null when Podmiot1 is missing', () => {
      expect(extractSellerNameFromFa3('<Faktura></Faktura>')).toBeNull()
    })

    it('handles mixed namespace prefixes', () => {
      expect(extractSellerNameFromFa3(FA3_MIXED_NS)).toBe('Mixed NS Seller')
    })
  })

  // ── Buyer name ──

  describe('extractBuyerNameFromFa3', () => {
    it('extracts Nazwa from Podmiot2', () => {
      expect(extractBuyerNameFromFa3(FA3_PLAIN)).toBe('Kupiec S.A.')
    })

    it('extracts Nazwa from namespaced XML', () => {
      expect(extractBuyerNameFromFa3(FA3_NAMESPACED)).toBe('Kupiec S.A.')
    })

    it('falls back to NazwaHandlowa when Nazwa is absent', () => {
      expect(extractBuyerNameFromFa3(FA3_TRADE_NAME)).toBe('INF Shipping')
    })

    it('extracts name for EU VAT buyer (no NIP)', () => {
      expect(extractBuyerNameFromFa3(FA3_BUYER_EU_VAT)).toBe('German Buyer GmbH')
    })

    it('extracts name for BrakID buyer (consumer)', () => {
      expect(extractBuyerNameFromFa3(FA3_BUYER_NO_ID)).toBe('Osoba Fizyczna')
    })
  })

  // ── Currency ──

  describe('extractCurrencyFromFa3', () => {
    it('extracts KodWaluty PLN from plain XML', () => {
      expect(extractCurrencyFromFa3(FA3_PLAIN)).toBe('PLN')
    })

    it('extracts KodWaluty from namespaced XML', () => {
      expect(extractCurrencyFromFa3(FA3_NAMESPACED)).toBe('PLN')
    })

    it('extracts EUR currency', () => {
      expect(extractCurrencyFromFa3(FA3_TRADE_NAME)).toBe('EUR')
    })

    it('returns null when KodWaluty is missing', () => {
      expect(extractCurrencyFromFa3(FA3_NO_LINE_ITEMS)).toBeNull()
    })
  })

  // ── Due date ──

  describe('extractDueDateFromFa3', () => {
    it('extracts TerminPlatnosci from Fa', () => {
      expect(extractDueDateFromFa3(FA3_PLAIN)).toBe('2026-05-01')
    })

    it('extracts from namespaced XML', () => {
      expect(extractDueDateFromFa3(FA3_NAMESPACED)).toBe('2026-05-01')
    })

    it('returns null when not present', () => {
      expect(extractDueDateFromFa3(FA3_NO_LINE_ITEMS)).toBeNull()
    })

    it('falls back to Platnosc wrapper when not in Fa', () => {
      expect(extractDueDateFromFa3(FA3_PLATNOSC_WRAPPER)).toBe('2026-05-15')
    })
  })

  // ── Payment method ──

  describe('extractPaymentMethodFromFa3', () => {
    it('extracts FormaPlatnosci from Fa', () => {
      expect(extractPaymentMethodFromFa3(FA3_PLAIN)).toBe('6')
    })

    it('extracts from namespaced XML', () => {
      expect(extractPaymentMethodFromFa3(FA3_NAMESPACED)).toBe('6')
    })

    it('returns null when not present', () => {
      expect(extractPaymentMethodFromFa3(FA3_NO_LINE_ITEMS)).toBeNull()
    })

    it('falls back to Platnosc wrapper when not in Fa', () => {
      expect(extractPaymentMethodFromFa3(FA3_PLATNOSC_WRAPPER)).toBe('6')
    })
  })

  // ── KSeF API response parsing ──

  describe('parseKsefXmlResponse', () => {
    it('parses session init response fields', () => {
      const result = parseKsefXmlResponse(KSEF_API_RESPONSE)
      expect(result.referenceNumber).toBe('20260401-SE-ABC123DEF456')
      expect(result.sessionToken).toBe('eyJhbGciOiJSUzI1NiJ9.test_token_payload')
      expect(result.timestamp).toBe('2026-04-01T10:00:00.000Z')
      expect(result.challenge).toBe('CHALLENGE-VALUE-XYZ')
    })

    it('handles fully namespaced API response (all inner tags with ns2:)', () => {
      const result = parseKsefXmlResponse(KSEF_API_RESPONSE_FULL_NS)
      expect(result.referenceNumber).toBe('REF-FULL-NS')
      expect(result.sessionToken).toBe('full-ns-token')
      expect(result.timestamp).toBe('2026-04-02T12:00:00.000Z')
    })

    it('parses processingCode as integer', () => {
      const xml = '<Response><ProcessingCode>200</ProcessingCode><ProcessingDescription>OK</ProcessingDescription></Response>'
      const result = parseKsefXmlResponse(xml)
      expect(result.processingCode).toBe(200)
      expect(result.processingDescription).toBe('OK')
    })

    it('parses ksefReferenceNumber and acquisitionTimestamp', () => {
      const xml = `<Response>
        <KsefReferenceNumber>7980332920-20260401-0100001AF629-AF</KsefReferenceNumber>
        <AcquisitionTimestamp>2026-04-01T10:30:00.000Z</AcquisitionTimestamp>
        <InvoiceNumber>FV/2026/04/001</InvoiceNumber>
      </Response>`
      const result = parseKsefXmlResponse(xml)
      expect(result.ksefReferenceNumber).toBe('7980332920-20260401-0100001AF629-AF')
      expect(result.acquisitionTimestamp).toBe('2026-04-01T10:30:00.000Z')
      expect(result.invoiceNumber).toBe('FV/2026/04/001')
    })

    it('returns empty object for empty XML', () => {
      expect(parseKsefXmlResponse('')).toEqual({})
    })

    it('returns empty object for XML with no recognised tags', () => {
      expect(parseKsefXmlResponse('<Foo><Bar>baz</Bar></Foo>')).toEqual({})
    })
  })

  // ── UPO extraction ──

  describe('extractUpoFromXml', () => {
    it('extracts Upo content', () => {
      expect(extractUpoFromXml(KSEF_UPO_RESPONSE)).toBe('BASE64ENCODEDUPOCONTENT==')
    })

    it('extracts UPO with uppercase tag variant', () => {
      expect(extractUpoFromXml(KSEF_UPO_UPPERCASE)).toBe('ALT_BASE64_CONTENT')
    })

    it('returns null when no Upo tag', () => {
      expect(extractUpoFromXml('<Response></Response>')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(extractUpoFromXml('')).toBeNull()
    })
  })

  // ── Exception details ──

  describe('extractExceptionDetails', () => {
    it('extracts multiple exception details', () => {
      const details = extractExceptionDetails(KSEF_EXCEPTION_RESPONSE)
      expect(details).toHaveLength(2)
      expect(details[0]).toEqual({ code: 21001, description: 'Invalid invoice structure' })
      expect(details[1]).toEqual({ code: 21002, description: 'Missing required field P_2' })
    })

    it('extracts duplicate invoice exception (code 440)', () => {
      const details = extractExceptionDetails(KSEF_DUPLICATE_EXCEPTION)
      expect(details).toHaveLength(1)
      expect(details[0]).toEqual({ code: 440, description: 'Duplikat faktury' })
    })

    it('returns empty array when no exceptions', () => {
      expect(extractExceptionDetails('<Response></Response>')).toEqual([])
    })

    it('returns empty array for empty input', () => {
      expect(extractExceptionDetails('')).toEqual([])
    })
  })

  // ── Correction invoices (faktura korygująca) ──

  describe('correction invoices', () => {
    it('does not confuse Podmiot1K NIP with Podmiot1 NIP', () => {
      expect(extractSellerNipFromFa3(FA3_CORRECTION)).toBe('7980332920')
      expect(extractSellerNameFromFa3(FA3_CORRECTION)).toBe('Sprzedawca Sp. z o.o.')
    })

    it('does not confuse Podmiot2K with Podmiot2', () => {
      expect(extractBuyerNipFromFa3(FA3_CORRECTION)).toBe('5261040828')
      expect(extractBuyerNameFromFa3(FA3_CORRECTION)).toBe('Kupiec S.A.')
    })

    it('extracts negative gross amount from correction', () => {
      expect(extractGrossAmountFromFa3(FA3_CORRECTION)).toBe('-200.00')
    })

    it('works with namespaced correction invoices', () => {
      expect(extractSellerNipFromFa3(FA3_CORRECTION_NAMESPACED)).toBe('7980332920')
      expect(extractBuyerNipFromFa3(FA3_CORRECTION_NAMESPACED)).toBe('5261040828')
      expect(extractInvoiceNumberFromFa3(FA3_CORRECTION_NAMESPACED)).toBe('KOR/NS/001')
      expect(extractGrossAmountFromFa3(FA3_CORRECTION_NAMESPACED)).toBe('-50.00')
    })
  })

  // ── Namespace handling ──

  describe('namespace prefix handling', () => {
    it('produces identical results for plain, tns:, and ns0: prefixed XML', () => {
      const variants = [FA3_PLAIN, FA3_NAMESPACED, FA3_NS0]

      for (const xml of variants) {
        expect(extractInvoiceNumberFromFa3(xml)).toBe('FV/2026/04/001')
        expect(extractInvoiceDateFromFa3(xml)).toBe('2026-04-01')
        expect(extractGrossAmountFromFa3(xml)).toBe('1845.00')
        expect(extractSellerNipFromFa3(xml)).toBe('7980332920')
        expect(extractBuyerNipFromFa3(xml)).toBe('5261040828')
        expect(extractSellerNameFromFa3(xml)).toBe('Sprzedawca Sp. z o.o.')
        expect(extractBuyerNameFromFa3(xml)).toBe('Kupiec S.A.')
        expect(extractCurrencyFromFa3(xml)).toBe('PLN')
        expect(extractDueDateFromFa3(xml)).toBe('2026-05-01')
        expect(extractPaymentMethodFromFa3(xml)).toBe('6')
        expect(extractLineItemsFromFa3(xml)).toHaveLength(2)
      }
    })

    it('handles mixed namespace prefixes on different subtrees', () => {
      expect(extractSellerNipFromFa3(FA3_MIXED_NS)).toBe('9999999999')
      expect(extractBuyerNipFromFa3(FA3_MIXED_NS)).toBe('8888888888')
      expect(extractInvoiceNumberFromFa3(FA3_MIXED_NS)).toBe('MIX/001')
      expect(extractGrossAmountFromFa3(FA3_MIXED_NS)).toBe('999.00')
    })

    it('does not mangle attribute values containing colons', () => {
      expect(extractInvoiceNumberFromFa3(FA3_COLON_IN_ATTRS)).toBe('FV/ATTR/001')
      expect(extractSellerNipFromFa3(FA3_COLON_IN_ATTRS)).toBe('1111111111')
    })

    it('handles long namespace prefixes', () => {
      const longNs = FA3_NAMESPACED.replace(/tns:/g, 'verylongnamespacepfx:')
      expect(extractInvoiceNumberFromFa3(longNs)).toBe('FV/2026/04/001')
      expect(extractLineItemsFromFa3(longNs)).toHaveLength(2)
    })
  })

  // ── Edge cases ──

  describe('edge cases', () => {
    it('handles XML with BOM (byte order mark)', () => {
      const bom = '\uFEFF'
      const xml = bom + FA3_NO_LINE_ITEMS
      expect(extractInvoiceNumberFromFa3(xml)).toBe('ZAL/2026/01')
    })

    it('handles XML with extra whitespace / newlines around values', () => {
      const xml = `<Faktura>
        <Podmiot1><NIP>  1111111111  </NIP><Nazwa>  Spaced Seller  </Nazwa></Podmiot1>
        <Fa>
          <P_1>  2026-01-01  </P_1>
          <P_2>  FV/SPACE  </P_2>
          <P_15>  100.00  </P_15>
        </Fa>
      </Faktura>`
      // getTagContent trims results
      expect(extractInvoiceNumberFromFa3(xml)).toBe('FV/SPACE')
      expect(extractSellerNipFromFa3(xml)).toBe('1111111111')
    })

    it('handles compact single-line XML (no whitespace)', () => {
      const xml = '<Faktura><Podmiot1><NIP>1111111111</NIP></Podmiot1><Fa><P_1>2026-01-01</P_1><P_2>COMPACT</P_2><P_15>10.00</P_15><FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>Item</P_7><P_11>10.00</P_11><P_12>23</P_12></FaWiersz></Fa></Faktura>'
      expect(extractInvoiceNumberFromFa3(xml)).toBe('COMPACT')
      const items = extractLineItemsFromFa3(xml)
      expect(items).toHaveLength(1)
      expect(items[0]!.description).toBe('Item')
    })

    it('handles XML with CDATA in description', () => {
      const xml = `<Faktura>
        <Podmiot1><NIP>1111111111</NIP></Podmiot1>
        <Fa>
          <P_2>FV/CDATA</P_2>
          <P_15>10.00</P_15>
          <FaWiersz>
            <NrWierszaFa>1</NrWierszaFa>
            <P_7><![CDATA[Description with <special> & "chars"]]></P_7>
            <P_11>10.00</P_11>
            <P_12>23</P_12>
          </FaWiersz>
        </Fa>
      </Faktura>`
      const items = extractLineItemsFromFa3(xml)
      expect(items).toHaveLength(1)
      // CDATA content is preserved as-is by our simple parser
      expect(items[0]!.description).toContain('Description with')
    })

    it('handles Polish characters in names and descriptions', () => {
      const xml = `<Faktura>
        <Podmiot1><NIP>1111111111</NIP><Nazwa>Łódzka Spółka Żeglugowa Ś.A.</Nazwa></Podmiot1>
        <Podmiot2><NIP>2222222222</NIP><Nazwa>Gdańskie Usługi Przeładunkowe</Nazwa></Podmiot2>
        <Fa>
          <P_2>FV/PL</P_2>
          <P_15>10.00</P_15>
          <FaWiersz>
            <NrWierszaFa>1</NrWierszaFa>
            <P_7>Usługa żeglugowa — przeładunek</P_7>
            <P_11>10.00</P_11>
            <P_12>23</P_12>
          </FaWiersz>
        </Fa>
      </Faktura>`
      expect(extractSellerNameFromFa3(xml)).toBe('Łódzka Spółka Żeglugowa Ś.A.')
      expect(extractBuyerNameFromFa3(xml)).toBe('Gdańskie Usługi Przeładunkowe')
      expect(extractLineItemsFromFa3(xml)[0]!.description).toBe('Usługa żeglugowa — przeładunek')
    })

    it('returns null for XML with self-closing Fa tag', () => {
      // <Fa/> has no content — should not throw
      expect(extractLineItemsFromFa3('<Faktura><Fa/></Faktura>')).toEqual([])
    })

    it('returns null for XML with tags but no matching close', () => {
      // Malformed XML — unclosed Fa
      expect(extractInvoiceNumberFromFa3('<Faktura><Fa><P_2>TEST</P_2>')).toBeNull()
    })
  })
})
