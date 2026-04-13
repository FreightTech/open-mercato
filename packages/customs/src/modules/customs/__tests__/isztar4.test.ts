import {
  getPageForChapter,
  findChapterNode,
  extractLeafCodes,
  extractHeadings,
  trimTreeToChapter,
} from '../services/isztar4.service'
import type { TariffTreeNode } from '../data/entities'

describe('Isztar4Service — tree traversal helpers', () => {
  // ── Chapter-to-page mapping ──────────────────────────────────────

  describe('getPageForChapter', () => {
    it('maps chapter 01 to page 1', () => {
      expect(getPageForChapter('01')).toBe(1)
    })

    it('maps chapter 5 (without leading zero) to page 1', () => {
      expect(getPageForChapter('5')).toBe(1)
    })

    it('maps chapter 15 to page 3', () => {
      expect(getPageForChapter('15')).toBe(3)
    })

    it('maps chapter 84 to page 16', () => {
      expect(getPageForChapter('84')).toBe(16)
    })

    it('maps chapter 85 to page 16', () => {
      expect(getPageForChapter('85')).toBe(16)
    })

    it('maps chapter 97 to page 21', () => {
      expect(getPageForChapter('97')).toBe(21)
    })

    it('maps chapter 99 to page 21', () => {
      expect(getPageForChapter('99')).toBe(21)
    })

    it('returns undefined for chapter 0', () => {
      expect(getPageForChapter('0')).toBeUndefined()
    })

    it('returns undefined for chapter 100', () => {
      expect(getPageForChapter('100')).toBeUndefined()
    })

    it('covers all chapters 1-99', () => {
      for (let chapter = 1; chapter <= 99; chapter++) {
        const page = getPageForChapter(String(chapter))
        expect(page).toBeDefined()
        expect(page).toBeGreaterThanOrEqual(1)
        expect(page).toBeLessThanOrEqual(21)
      }
    })
  })

  // ── Mock tree data ───────────────────────────────────────────────
  // Simulates the structure of ISZTAR4 data:
  // Section → Chapter description → Headings (4-digit) → Subheadings → Leaf codes (10-digit)

  const mockSectionTree: TariffTreeNode = {
    description: 'SECTION XVI - MACHINERY AND MECHANICAL APPLIANCES',
    children: [
      {
        description: 'Chapter 84 - Nuclear reactors, boilers, machinery...',
        children: [
          {
            code: '8429',
            description: 'Self-propelled bulldozers, graders, scrapers...',
            children: [
              {
                code: '842911',
                description: 'Track laying',
                children: [
                  { code: '8429110000', description: 'Bulldozers and angledozers, track laying' },
                ],
              },
              {
                code: '842919',
                description: 'Other',
                children: [
                  { code: '8429190000', description: 'Bulldozers and angledozers, other' },
                ],
              },
              {
                code: '842920',
                description: 'Graders and levellers',
                children: [
                  { code: '8429200000', description: 'Self-propelled graders and levellers' },
                ],
              },
              {
                code: '842951',
                description: 'Front-end shovel loaders',
                children: [
                  { code: '8429511000', description: 'Front-end shovel loaders, with excavating mechanism rotating 360 degrees' },
                  { code: '8429519000', description: 'Front-end shovel loaders, other' },
                ],
              },
            ],
          },
          {
            code: '8430',
            description: 'Other moving, grading, levelling machinery',
            children: [
              {
                code: '843010',
                description: 'Pile-drivers and pile-extractors',
                children: [
                  { code: '8430100000', description: 'Pile-drivers and pile-extractors' },
                ],
              },
            ],
          },
        ],
      },
      {
        description: 'Chapter 85 - Electrical machinery and equipment',
        children: [
          {
            code: '8501',
            description: 'Electric motors and generators',
            children: [
              {
                code: '850110',
                description: 'Motors of an output not exceeding 37.5 W',
                children: [
                  { code: '8501101000', description: 'Synchronous motors, output <= 18W' },
                  { code: '8501109900', description: 'Other motors, output <= 37.5W' },
                ],
              },
            ],
          },
        ],
      },
    ],
  }

  // ── findChapterNode ──────────────────────────────────────────────

  describe('findChapterNode', () => {
    it('finds chapter 84 node', () => {
      const node = findChapterNode(mockSectionTree, '84')
      expect(node).not.toBeNull()
      expect(node!.description).toBe('Chapter 84 - Nuclear reactors, boilers, machinery...')
    })

    it('finds chapter 85 node', () => {
      const node = findChapterNode(mockSectionTree, '85')
      expect(node).not.toBeNull()
      expect(node!.description).toBe('Chapter 85 - Electrical machinery and equipment')
    })

    it('returns null for non-existent chapter', () => {
      const node = findChapterNode(mockSectionTree, '39')
      expect(node).toBeNull()
    })

    it('handles single-digit chapter codes', () => {
      // Chapter 84 with code "84" should still match
      const node = findChapterNode(mockSectionTree, '84')
      expect(node).not.toBeNull()
    })
  })

  // ── extractLeafCodes ─────────────────────────────────────────────

  describe('extractLeafCodes', () => {
    it('extracts leaf codes for heading 8429', () => {
      const chapterNode = mockSectionTree.children![0] // Chapter 84
      const leaves = extractLeafCodes(chapterNode, '8429')
      expect(leaves).toHaveLength(5)
      expect(leaves.map((l) => l.code)).toEqual([
        '8429110000',
        '8429190000',
        '8429200000',
        '8429511000',
        '8429519000',
      ])
    })

    it('extracts leaf codes for heading 8430', () => {
      const chapterNode = mockSectionTree.children![0]
      const leaves = extractLeafCodes(chapterNode, '8430')
      expect(leaves).toHaveLength(1)
      expect(leaves[0].code).toBe('8430100000')
    })

    it('returns empty array for non-existent heading', () => {
      const chapterNode = mockSectionTree.children![0]
      const leaves = extractLeafCodes(chapterNode, '9999')
      expect(leaves).toHaveLength(0)
    })

    it('returns leaf descriptions', () => {
      const chapterNode = mockSectionTree.children![0]
      const leaves = extractLeafCodes(chapterNode, '8429')
      const frontEnd = leaves.find((l) => l.code === '8429511000')
      expect(frontEnd?.description).toBe('Front-end shovel loaders, with excavating mechanism rotating 360 degrees')
    })
  })

  // ── extractHeadings ──────────────────────────────────────────────

  describe('extractHeadings', () => {
    it('extracts headings for chapter 84', () => {
      const chapterNode = mockSectionTree.children![0]
      const headings = extractHeadings(chapterNode, '84')
      const codes = headings.filter((h) => h.code).map((h) => h.code)
      expect(codes).toContain('8429')
      expect(codes).toContain('8430')
    })

    it('extracts headings for chapter 85', () => {
      const chapterNode = mockSectionTree.children![1]
      const headings = extractHeadings(chapterNode, '85')
      const codes = headings.filter((h) => h.code).map((h) => h.code)
      expect(codes).toContain('8501')
    })
  })

  // ── trimTreeToChapter ────────────────────────────────────────────

  describe('trimTreeToChapter', () => {
    it('trims section tree to chapter 84', () => {
      const trimmed = trimTreeToChapter(mockSectionTree, '84')
      expect(trimmed).not.toBeNull()
      // The trimmed tree should contain only chapter 84 headings
      const allCodes: string[] = []
      function collectCodes(node: TariffTreeNode) {
        if (node.code) allCodes.push(node.code)
        node.children?.forEach(collectCodes)
      }
      collectCodes(trimmed!)
      // All codes should start with 84
      for (const code of allCodes) {
        expect(code.startsWith('84')).toBe(true)
      }
    })

    it('trims section tree to chapter 85', () => {
      const trimmed = trimTreeToChapter(mockSectionTree, '85')
      expect(trimmed).not.toBeNull()
      const allCodes: string[] = []
      function collectCodes(node: TariffTreeNode) {
        if (node.code) allCodes.push(node.code)
        node.children?.forEach(collectCodes)
      }
      collectCodes(trimmed!)
      for (const code of allCodes) {
        expect(code.startsWith('85')).toBe(true)
      }
    })

    it('returns null for non-existent chapter', () => {
      const trimmed = trimTreeToChapter(mockSectionTree, '39')
      expect(trimmed).toBeNull()
    })

    it('preserves tree depth', () => {
      const trimmed = trimTreeToChapter(mockSectionTree, '84')
      expect(trimmed).not.toBeNull()
      // Should have heading 8429 with subheadings with leaf codes
      function findNode(node: TariffTreeNode, code: string): TariffTreeNode | null {
        if (node.code === code) return node
        for (const child of node.children ?? []) {
          const found = findNode(child, code)
          if (found) return found
        }
        return null
      }
      const heading8429 = findNode(trimmed!, '8429')
      expect(heading8429).not.toBeNull()
      expect(heading8429!.children).toBeDefined()
      expect(heading8429!.children!.length).toBeGreaterThan(0)
      // Check a leaf exists under this heading
      const leaf = findNode(heading8429!, '8429110000')
      expect(leaf).not.toBeNull()
      expect(leaf!.description).toBe('Bulldozers and angledozers, track laying')
    })
  })
})
