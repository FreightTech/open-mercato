import { createNatsObjectStoreDriver } from '../object-store-driver'

// Mock NATS Object Store
const mockObjectStore = {
  putBlob: jest.fn(),
  getBlob: jest.fn(),
  delete: jest.fn(),
  info: jest.fn(),
}

const mockJetStreamClient = {
  views: {
    os: jest.fn().mockResolvedValue(mockObjectStore),
  },
}

const mockNatsConnection = {
  jetstream: jest.fn(() => mockJetStreamClient),
  drain: jest.fn().mockResolvedValue(undefined),
  isClosed: jest.fn(() => false),
}

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue(mockNatsConnection),
}))

describe('NATS Object Store Storage Driver', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockNatsConnection.isClosed.mockReturnValue(false)
  })

  describe('metadata', () => {
    it('should have correct id and name', () => {
      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })
      expect(driver.id).toBe('nats')
      expect(driver.name).toBe('NATS Object Store')
    })
  })

  describe('writeFile', () => {
    it('should write a file to the Object Store', async () => {
      mockObjectStore.putBlob.mockResolvedValue({ name: 'test.pdf', size: 11 })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const data = Buffer.from('hello world')
      await driver.writeFile('docs', 'test.pdf', data)

      expect(mockJetStreamClient.views.os).toHaveBeenCalledWith('attachments-docs')
      expect(mockObjectStore.putBlob).toHaveBeenCalledWith(
        { name: 'test.pdf' },
        expect.any(Blob)
      )
    })

    it('should include metadata when provided', async () => {
      mockObjectStore.putBlob.mockResolvedValue({ name: 'test.pdf', size: 11 })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const data = Buffer.from('hello world')
      const metadata = { contentType: 'application/pdf', uploadedBy: 'user-123' }
      await driver.writeFile('docs', 'test.pdf', data, metadata)

      expect(mockObjectStore.putBlob).toHaveBeenCalledWith(
        { name: 'test.pdf', metadata },
        expect.any(Blob)
      )
    })

    it('should not include metadata key when metadata is empty', async () => {
      mockObjectStore.putBlob.mockResolvedValue({ name: 'test.pdf', size: 11 })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      await driver.writeFile('docs', 'test.pdf', Buffer.from('data'), {})

      expect(mockObjectStore.putBlob).toHaveBeenCalledWith(
        { name: 'test.pdf' },
        expect.any(Blob)
      )
    })

    it('should use custom bucket prefix', async () => {
      mockObjectStore.putBlob.mockResolvedValue({ name: 'file.txt', size: 4 })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
        bucketPrefix: 'files',
      })

      await driver.writeFile('uploads', 'file.txt', Buffer.from('data'))

      expect(mockJetStreamClient.views.os).toHaveBeenCalledWith('files-uploads')
    })
  })

  describe('readFile', () => {
    it('should read a file from the Object Store', async () => {
      const fileContent = Buffer.from('file content here')
      const mockBlob = new Blob([fileContent])

      mockObjectStore.getBlob.mockResolvedValue({
        getBlob: () => Promise.resolve(mockBlob),
        error: null,
      })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const result = await driver.readFile('docs', 'test.pdf')

      expect(mockObjectStore.getBlob).toHaveBeenCalledWith('test.pdf')
      expect(Buffer.isBuffer(result)).toBe(true)
      expect(result.toString()).toBe('file content here')
    })

    it('should throw when object has an error', async () => {
      mockObjectStore.getBlob.mockResolvedValue({
        getBlob: () => Promise.resolve(new Blob()),
        error: new Error('object not found'),
      })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      await expect(driver.readFile('docs', 'missing.pdf')).rejects.toThrow('object not found')
    })
  })

  describe('deleteFile', () => {
    it('should delete a file from the Object Store', async () => {
      mockObjectStore.delete.mockResolvedValue({ purged: true })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      await driver.deleteFile('docs', 'test.pdf')

      expect(mockObjectStore.delete).toHaveBeenCalledWith('test.pdf')
    })
  })

  describe('fileExists', () => {
    it('should return true when file exists and is not deleted', async () => {
      mockObjectStore.info.mockResolvedValue({
        name: 'test.pdf',
        size: 100,
        chunks: 1,
        deleted: false,
      })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const exists = await driver.fileExists('docs', 'test.pdf')

      expect(exists).toBe(true)
      expect(mockObjectStore.info).toHaveBeenCalledWith('test.pdf')
    })

    it('should return false when file does not exist', async () => {
      mockObjectStore.info.mockResolvedValue(null)

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const exists = await driver.fileExists('docs', 'missing.pdf')

      expect(exists).toBe(false)
    })

    it('should return false when file is marked as deleted', async () => {
      mockObjectStore.info.mockResolvedValue({
        name: 'test.pdf',
        size: 100,
        chunks: 1,
        deleted: true,
      })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const exists = await driver.fileExists('docs', 'test.pdf')

      expect(exists).toBe(false)
    })

    it('should return false when info throws', async () => {
      mockObjectStore.info.mockRejectedValue(new Error('bucket not found'))

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const exists = await driver.fileExists('docs', 'test.pdf')

      expect(exists).toBe(false)
    })
  })

  describe('isAvailable', () => {
    it('should return true when connection is open', async () => {
      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const available = await driver.isAvailable!()
      expect(available).toBe(true)
    })

    it('should return false when connection is closed', async () => {
      mockNatsConnection.isClosed.mockReturnValue(true)

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      const available = await driver.isAvailable!()
      expect(available).toBe(false)
    })
  })

  describe('bucket caching', () => {
    it('should reuse the same bucket for multiple operations', async () => {
      mockObjectStore.putBlob.mockResolvedValue({ name: 'a.txt', size: 1 })
      mockObjectStore.info.mockResolvedValue({ name: 'a.txt', size: 1, chunks: 1, deleted: false })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      await driver.writeFile('docs', 'a.txt', Buffer.from('a'))
      await driver.writeFile('docs', 'b.txt', Buffer.from('b'))
      await driver.fileExists('docs', 'a.txt')

      // Object Store bucket should only be opened once for 'docs'
      expect(mockJetStreamClient.views.os).toHaveBeenCalledTimes(1)
    })

    it('should open separate buckets for different bucket keys', async () => {
      mockObjectStore.putBlob.mockResolvedValue({ name: 'a.txt', size: 1 })

      const driver = createNatsObjectStoreDriver({
        connection: mockNatsConnection as never,
      })

      await driver.writeFile('docs', 'a.txt', Buffer.from('a'))
      await driver.writeFile('images', 'b.png', Buffer.from('b'))

      expect(mockJetStreamClient.views.os).toHaveBeenCalledTimes(2)
      expect(mockJetStreamClient.views.os).toHaveBeenCalledWith('attachments-docs')
      expect(mockJetStreamClient.views.os).toHaveBeenCalledWith('attachments-images')
    })
  })
})
