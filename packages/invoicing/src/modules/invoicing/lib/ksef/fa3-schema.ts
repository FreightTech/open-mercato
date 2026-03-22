export const FA3_NAMESPACE = 'http://crd.gov.pl/wzor/2023/06/29/12648/'
export const FA3_SCHEMA_VERSION = 'FA(3)'
export const FA3_CODING_SYSTEM = 'JPK'

export const FA3_SYSTEM_CODE = 'FA (3)'
export const FA3_FORM_CODE = 'FA'
export const FA3_SCHEMA_VERSION_NUMBER = '3-0E'

export const XML_NAMESPACE_XSI = 'http://www.w3.org/2001/XMLSchema-instance'
export const XML_NAMESPACE_XSD = 'http://www.w3.org/2001/XMLSchema'
export const XML_ENCODING = 'UTF-8'

export const FA3_ROOT_ELEMENT = 'Faktura'

export const FA3_HEADER_ELEMENT = 'Naglowek'
export const FA3_SELLER_ELEMENT = 'Podmiot1'
export const FA3_BUYER_ELEMENT = 'Podmiot2'
export const FA3_INVOICE_DATA_ELEMENT = 'Fa'
export const FA3_ATTACHMENTS_ELEMENT = 'Stopka'

export const FA3_SELLER_ID_ELEMENT = 'DaneIdentyfikacyjne'
export const FA3_SELLER_ADDRESS_ELEMENT = 'Adres'
export const FA3_BUYER_ID_ELEMENT = 'DaneIdentyfikacyjne'
export const FA3_BUYER_ADDRESS_ELEMENT = 'Adres'

export const FA3_INVOICE_LINE_ELEMENT = 'FaWiersz'

export const INVOICE_TYPE_CODES = {
  VAT: 'VAT',
  KOR: 'KOR',
  ZAL: 'ZAL',
  ROZ: 'ROZ',
  UPR: 'UPR',
  KOR_ZAL: 'KOR_ZAL',
  KOR_ROZ: 'KOR_ROZ',
} as const

export type InvoiceTypeCode = (typeof INVOICE_TYPE_CODES)[keyof typeof INVOICE_TYPE_CODES]

export const PAYMENT_METHOD_CODES = {
  TRANSFER: '1',
  CASH: '2',
  CARD: '3',
  CHECK: '4',
  CREDIT: '5',
  OTHER: '6',
} as const

export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[keyof typeof PAYMENT_METHOD_CODES]

export const VAT_RATE_MAP: Record<string, string> = {
  '23': '23',
  '22': '22',
  '8': '8',
  '7': '7',
  '5': '5',
  '4': '4',
  '3': '3',
  '0': '0',
  zw: 'zw',
  oo: 'oo',
  np: 'np',
}

export const GTU_CODES = [
  'GTU_01',
  'GTU_02',
  'GTU_03',
  'GTU_04',
  'GTU_05',
  'GTU_06',
  'GTU_07',
  'GTU_08',
  'GTU_09',
  'GTU_10',
  'GTU_11',
  'GTU_12',
  'GTU_13',
] as const

export type GtuCode = (typeof GTU_CODES)[number]

export const COUNTRY_CODE_POLAND = 'PL'
export const DEFAULT_CURRENCY = 'PLN'

export const FA3_MAX_LINE_DESCRIPTION_LENGTH = 256
export const FA3_MAX_INVOICE_NUMBER_LENGTH = 256
export const FA3_MAX_ANNOTATION_LENGTH = 256
