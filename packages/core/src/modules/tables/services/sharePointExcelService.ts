import type { MicrosoftGraphService } from './microsoftGraphService'

export interface SharePointSite {
  id: string
  name: string
  displayName: string
  webUrl: string
}

export interface SharePointDrive {
  id: string
  name: string
  driveType: string
  webUrl: string
}

export interface SharePointItem {
  id: string
  name: string
  webUrl: string
  size: number
  isFolder: boolean
  lastModifiedDateTime: string
}

export interface WorksheetInfo {
  id: string
  name: string
  position: number
}

export interface WorksheetData {
  headers: string[]
  rows: Array<Array<string | number | boolean | null>>
  totalRows: number
}

function columnIndexToLetter(index: number): string {
  let result = ''
  let remaining = index
  while (remaining >= 0) {
    result = String.fromCharCode(65 + (remaining % 26)) + result
    remaining = Math.floor(remaining / 26) - 1
  }
  return result
}

export class SharePointExcelService {
  constructor(private graphService: MicrosoftGraphService) {}

  async resolveSiteId(siteUrl: string): Promise<string> {
    const client = await this.graphService.getClient()
    const url = new URL(siteUrl)
    const hostname = url.hostname
    const sitePath = url.pathname.replace(/^\//, '').replace(/\/$/, '')
    const response = await client.api(`/sites/${hostname}:/${sitePath}`).select('id').get()
    return response.id
  }

  async listSites(search?: string): Promise<SharePointSite[]> {
    const client = await this.graphService.getClient()
    const query = search?.trim() || '*'
    const response = await client
      .api(`/sites?search=${encodeURIComponent(query)}`)
      .get()

    console.log('[tables] listSites response:', JSON.stringify({ search: query, count: response.value?.length, value: response.value?.slice(0, 3) }))

    const sites: SharePointSite[] = (response.value || []).map((site: Record<string, unknown>) => ({
      id: site.id as string,
      name: site.name as string,
      displayName: site.displayName as string,
      webUrl: site.webUrl as string,
    }))
    return sites
  }

  async listDrives(siteId: string): Promise<SharePointDrive[]> {
    const client = await this.graphService.getClient()
    const response = await client
      .api(`/sites/${siteId}/drives`)
      .select('id,name,driveType,webUrl')
      .get()

    return (response.value || []).map((drive: Record<string, unknown>) => ({
      id: drive.id as string,
      name: drive.name as string,
      driveType: drive.driveType as string,
      webUrl: drive.webUrl as string,
    }))
  }

  async listItems(driveId: string, path?: string): Promise<SharePointItem[]> {
    const client = await this.graphService.getClient()
    const itemsPath = path && path !== '/'
      ? `/drives/${driveId}/root:/${path}:/children`
      : `/drives/${driveId}/root/children`

    const response = await client
      .api(itemsPath)
      .select('id,name,webUrl,size,lastModifiedDateTime,folder,file')
      .orderby('name')
      .top(200)
      .get()

    const items: SharePointItem[] = (response.value || [])
      .filter((item: Record<string, unknown>) => {
        if (item.folder) return true
        const name = (item.name as string) || ''
        return name.toLowerCase().endsWith('.xlsx')
      })
      .map((item: Record<string, unknown>) => ({
        id: item.id as string,
        name: item.name as string,
        webUrl: item.webUrl as string,
        size: (item.size as number) || 0,
        isFolder: !!item.folder,
        lastModifiedDateTime: (item.lastModifiedDateTime as string) || '',
      }))

    return items
  }

  async listWorksheets(driveId: string, itemId: string): Promise<WorksheetInfo[]> {
    const client = await this.graphService.getClient()
    const response = await client
      .api(`/drives/${driveId}/items/${itemId}/workbook/worksheets`)
      .select('id,name,position')
      .get()

    return (response.value || []).map((ws: Record<string, unknown>) => ({
      id: ws.id as string,
      name: ws.name as string,
      position: (ws.position as number) || 0,
    }))
  }

  async readWorksheetData(
    driveId: string,
    itemId: string,
    worksheetName: string,
    range?: string | null,
    page: number = 1,
    pageSize: number = 100,
    hasHeaderRow: boolean = true,
  ): Promise<WorksheetData> {
    const client = await this.graphService.getClient()
    const encodedName = encodeURIComponent(worksheetName)

    let apiPath: string
    if (range) {
      apiPath = `/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodedName}')/range(address='${range}')`
    } else {
      apiPath = `/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodedName}')/usedRange`
    }

    const response = await client
      .api(apiPath)
      .select('values,rowCount,columnCount')
      .get()

    const allValues: Array<Array<string | number | boolean | null>> = response.values || []
    if (allValues.length === 0) {
      return { headers: [], rows: [], totalRows: 0 }
    }

    let headers: string[]
    let dataRows: Array<Array<string | number | boolean | null>>

    if (hasHeaderRow) {
      headers = allValues[0].map((val, index) =>
        val !== null && val !== undefined && String(val).trim() !== ''
          ? String(val)
          : `Column ${columnIndexToLetter(index)}`
      )
      dataRows = allValues.slice(1)
    } else {
      const colCount = allValues[0].length
      headers = Array.from({ length: colCount }, (_, index) => `Column ${columnIndexToLetter(index)}`)
      dataRows = allValues
    }

    const totalRows = dataRows.length
    const startIndex = (page - 1) * pageSize
    const paginatedRows = dataRows.slice(startIndex, startIndex + pageSize)

    return {
      headers,
      rows: paginatedRows,
      totalRows,
    }
  }

  async writeCell(
    driveId: string,
    itemId: string,
    worksheetName: string,
    row: number,
    col: number,
    value: string | number | boolean | null,
    hasHeaderRow: boolean = true,
  ): Promise<void> {
    const client = await this.graphService.getClient()
    const encodedName = encodeURIComponent(worksheetName)

    const excelRow = hasHeaderRow ? row + 2 : row + 1
    const colLetter = columnIndexToLetter(col)
    const cellAddress = `${colLetter}${excelRow}`

    await client
      .api(`/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodedName}')/range(address='${cellAddress}')`)
      .patch({
        values: [[value]],
      })
  }
}
