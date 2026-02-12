'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type WizardStep = 'site' | 'files' | 'worksheet' | 'configure'

type SiteItem = { id: string; name: string; displayName: string; webUrl: string }
type DriveItem = { id: string; name: string; driveType: string; webUrl: string }
type FileItem = { id: string; name: string; webUrl: string; size: number; isFolder: boolean; lastModifiedDateTime: string }
type WorksheetItem = { id: string; name: string; position: number }

export default function TablesCreatePage() {
  const router = useRouter()
  const t = useT()
  const [step, setStep] = React.useState<WizardStep>('site')
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  // Site step
  const [sites, setSites] = React.useState<SiteItem[]>([])
  const [selectedSite, setSelectedSite] = React.useState<SiteItem | null>(null)

  // Files step
  const [drives, setDrives] = React.useState<DriveItem[]>([])
  const [selectedDrive, setSelectedDrive] = React.useState<DriveItem | null>(null)
  const [files, setFiles] = React.useState<FileItem[]>([])
  const [currentPath, setCurrentPath] = React.useState<string[]>([])
  const [selectedFile, setSelectedFile] = React.useState<FileItem | null>(null)

  // Worksheet step
  const [worksheets, setWorksheets] = React.useState<WorksheetItem[]>([])
  const [selectedWorksheet, setSelectedWorksheet] = React.useState<WorksheetItem | null>(null)

  // Configure step
  const [tableName, setTableName] = React.useState('')
  const [hasHeaderRow, setHasHeaderRow] = React.useState(true)

  const loadSites = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await apiCall<{ items: SiteItem[]; error?: string }>('/api/tables/browse/sites')
      if (result.ok && result.result && !result.result.error) {
        setSites(result.result.items || [])
      } else {
        const errorMessage = (result.result as { error?: string } | undefined)?.error || 'Failed to load sites'
        flash(errorMessage, 'error')
      }
    } catch {
      flash(t('tables.create.error.searchSites', 'Failed to load sites'), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [t])

  React.useEffect(() => {
    loadSites()
  }, [loadSites])

  const loadDrives = React.useCallback(async (siteId: string) => {
    setIsLoading(true)
    try {
      const result = await apiCall<{ items: DriveItem[] }>(`/api/tables/browse/drives?siteId=${encodeURIComponent(siteId)}`)
      if (result.ok && result.result) {
        setDrives(result.result.items || [])
      }
    } catch {
      flash(t('tables.create.error.loadDrives', 'Failed to load drives'), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [t])

  const loadFiles = React.useCallback(async (driveId: string, path?: string) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ driveId })
      if (path) params.set('path', path)
      const result = await apiCall<{ items: FileItem[] }>(`/api/tables/browse/files?${params.toString()}`)
      if (result.ok && result.result) {
        setFiles(result.result.items || [])
      }
    } catch {
      flash(t('tables.create.error.loadFiles', 'Failed to load files'), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [t])

  const loadWorksheets = React.useCallback(async (driveId: string, itemId: string) => {
    setIsLoading(true)
    try {
      const result = await apiCall<{ items: WorksheetItem[] }>(`/api/tables/browse/worksheets?driveId=${encodeURIComponent(driveId)}&itemId=${encodeURIComponent(itemId)}`)
      if (result.ok && result.result) {
        setWorksheets(result.result.items || [])
      }
    } catch {
      flash(t('tables.create.error.loadWorksheets', 'Failed to load worksheets'), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [t])

  const handleSelectSite = React.useCallback((site: SiteItem) => {
    setSelectedSite(site)
    setSelectedDrive(null)
    setSelectedFile(null)
    setSelectedWorksheet(null)
    setCurrentPath([])
    setStep('files')
    loadDrives(site.id)
  }, [loadDrives])

  const handleSelectDrive = React.useCallback((drive: DriveItem) => {
    setSelectedDrive(drive)
    setSelectedFile(null)
    setCurrentPath([])
    loadFiles(drive.id)
  }, [loadFiles])

  const handleNavigateFolder = React.useCallback((folder: FileItem) => {
    if (!selectedDrive) return
    const newPath = [...currentPath, folder.name]
    setCurrentPath(newPath)
    loadFiles(selectedDrive.id, newPath.join('/'))
  }, [selectedDrive, currentPath, loadFiles])

  const handleNavigateUp = React.useCallback(() => {
    if (!selectedDrive || currentPath.length === 0) return
    const newPath = currentPath.slice(0, -1)
    setCurrentPath(newPath)
    loadFiles(selectedDrive.id, newPath.length > 0 ? newPath.join('/') : undefined)
  }, [selectedDrive, currentPath, loadFiles])

  const handleSelectFile = React.useCallback((file: FileItem) => {
    if (file.isFolder) {
      handleNavigateFolder(file)
      return
    }
    if (!selectedDrive) return
    setSelectedFile(file)
    setTableName(file.name.replace(/\.xlsx$/i, ''))
    setStep('worksheet')
    loadWorksheets(selectedDrive.id, file.id)
  }, [selectedDrive, handleNavigateFolder, loadWorksheets])

  const handleSelectWorksheet = React.useCallback((ws: WorksheetItem) => {
    setSelectedWorksheet(ws)
    setStep('configure')
  }, [])

  const handleSave = React.useCallback(async () => {
    if (!selectedSite || !selectedDrive || !selectedFile || !selectedWorksheet) return
    if (!tableName.trim()) {
      flash(t('tables.create.error.nameRequired', 'Name is required'), 'error')
      return
    }

    setIsSaving(true)
    try {
      const filePath = currentPath.length > 0
        ? `${currentPath.join('/')}/${selectedFile.name}`
        : selectedFile.name

      const result = await apiCall<{ id: string }>('/api/tables/definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tableName.trim(),
          siteId: selectedSite.id,
          driveId: selectedDrive.id,
          itemId: selectedFile.id,
          filePath,
          worksheetName: selectedWorksheet.name,
          hasHeaderRow,
        }),
      })

      if (result.ok && result.result?.id) {
        flash(t('tables.create.success', 'Table created successfully'), 'success')
        router.push(`/backend/tables/${result.result.id}`)
      } else {
        const errorPayload = result.result as { error?: string } | undefined
        flash(typeof errorPayload?.error === 'string' ? errorPayload.error : t('tables.create.error.save', 'Failed to create table'), 'error')
      }
    } catch {
      flash(t('tables.create.error.save', 'Failed to create table'), 'error')
    } finally {
      setIsSaving(false)
    }
  }, [selectedSite, selectedDrive, selectedFile, selectedWorksheet, tableName, hasHeaderRow, currentPath, router, t])

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && step === 'configure') {
      event.preventDefault()
      handleSave()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      router.push('/backend/tables')
    }
  }, [step, handleSave, router])

  const stepLabels: Record<WizardStep, string> = {
    site: t('tables.create.steps.site', '1. Select Site'),
    files: t('tables.create.steps.files', '2. Browse Files'),
    worksheet: t('tables.create.steps.worksheet', '3. Select Worksheet'),
    configure: t('tables.create.steps.configure', '4. Configure & Save'),
  }

  return (
    <Page>
      <PageBody>
        <div className="max-w-3xl mx-auto" onKeyDown={handleKeyDown}>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">{t('tables.create.title', 'Create Table')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('tables.create.subtitle', 'Connect a SharePoint Excel file to view and edit its data.')}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6 text-sm">
            {(Object.keys(stepLabels) as WizardStep[]).map((s) => (
              <span
                key={s}
                className={`px-3 py-1 rounded-full ${s === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {stepLabels[s]}
              </span>
            ))}
          </div>

          {/* Step: Select Site */}
          {step === 'site' && (
            <div className="space-y-4">
              <Label>{t('tables.create.selectSite', 'Select a SharePoint site')}</Label>

              {isLoading && <LoadingMessage />}

              {!isLoading && sites.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">
                  {t('tables.create.noSites', 'No sites found.')}
                </p>
              )}

              <div className="space-y-1">
                {sites.map((site) => (
                  <button
                    key={site.id}
                    onClick={() => handleSelectSite(site)}
                    className="w-full text-left px-4 py-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="font-medium">{site.displayName}</div>
                    <div className="text-sm text-muted-foreground">{site.webUrl}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step: Browse Files */}
          {step === 'files' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="outline" size="sm" onClick={() => setStep('site')}>
                  {t('tables.create.back', 'Back')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('tables.create.site', 'Site')}: <strong>{selectedSite?.displayName}</strong>
                </span>
              </div>

              {/* Drive selector */}
              {!selectedDrive && (
                <div className="space-y-1">
                  <Label>{t('tables.create.selectDrive', 'Select a document library')}</Label>
                  {isLoading && <LoadingMessage />}
                  {drives.map((drive) => (
                    <button
                      key={drive.id}
                      onClick={() => handleSelectDrive(drive)}
                      className="w-full text-left px-4 py-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="font-medium">{drive.name}</div>
                      <div className="text-sm text-muted-foreground">{drive.driveType}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* File browser */}
              {selectedDrive && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <button
                      className="hover:underline"
                      onClick={() => { setSelectedDrive(null); setCurrentPath([]); setFiles([]) }}
                    >
                      {selectedDrive.name}
                    </button>
                    {currentPath.map((segment, index) => (
                      <React.Fragment key={index}>
                        <span>/</span>
                        <span>{segment}</span>
                      </React.Fragment>
                    ))}
                  </div>

                  {currentPath.length > 0 && (
                    <button
                      onClick={handleNavigateUp}
                      className="w-full text-left px-4 py-2 rounded-lg border hover:bg-accent transition-colors text-sm"
                    >
                      ..
                    </button>
                  )}

                  {isLoading && <LoadingMessage />}

                  {!isLoading && files.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4">
                      {t('tables.create.noFiles', 'No Excel files found in this location.')}
                    </p>
                  )}

                  <div className="space-y-1">
                    {files.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => handleSelectFile(file)}
                        className="w-full text-left px-4 py-2 rounded-lg border hover:bg-accent transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{file.isFolder ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</span>
                          <span className={file.isFolder ? 'font-medium' : ''}>{file.name}</span>
                        </div>
                        {!file.isFolder && (
                          <span className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Select Worksheet */}
          {step === 'worksheet' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="outline" size="sm" onClick={() => setStep('files')}>
                  {t('tables.create.back', 'Back')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('tables.create.file', 'File')}: <strong>{selectedFile?.name}</strong>
                </span>
              </div>

              <Label>{t('tables.create.selectWorksheet', 'Select a worksheet')}</Label>

              {isLoading && <LoadingMessage />}

              {!isLoading && worksheets.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">
                  {t('tables.create.noWorksheets', 'No worksheets found.')}
                </p>
              )}

              <div className="space-y-1">
                {worksheets.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSelectWorksheet(ws)}
                    className="w-full text-left px-4 py-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="font-medium">{ws.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step: Configure & Save */}
          {step === 'configure' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="outline" size="sm" onClick={() => setStep('worksheet')}>
                  {t('tables.create.back', 'Back')}
                </Button>
              </div>

              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div><strong>{t('tables.create.summary.site', 'Site')}:</strong> {selectedSite?.displayName}</div>
                <div><strong>{t('tables.create.summary.drive', 'Drive')}:</strong> {selectedDrive?.name}</div>
                <div><strong>{t('tables.create.summary.file', 'File')}:</strong> {selectedFile?.name}</div>
                <div><strong>{t('tables.create.summary.worksheet', 'Worksheet')}:</strong> {selectedWorksheet?.name}</div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tableName">{t('tables.create.name', 'Table Name')}</Label>
                <Input
                  id="tableName"
                  value={tableName}
                  onChange={(event) => setTableName(event.target.value)}
                  placeholder={t('tables.create.namePlaceholder', 'Enter a name for this table...')}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="hasHeaderRow"
                  type="checkbox"
                  checked={hasHeaderRow}
                  onChange={(event) => setHasHeaderRow(event.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="hasHeaderRow">{t('tables.create.hasHeaderRow', 'First row contains headers')}</Label>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={isSaving || !tableName.trim()}>
                  {isSaving ? t('tables.create.saving', 'Saving...') : t('tables.create.save', 'Create Table')}
                </Button>
                <Button variant="outline" onClick={() => router.push('/backend/tables')}>
                  {t('tables.create.cancel', 'Cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
