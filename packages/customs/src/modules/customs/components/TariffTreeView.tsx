"use client"
import * as React from 'react'

interface TariffTreeNode {
  code?: string
  description: string
  children?: TariffTreeNode[]
}

interface TariffTreePath {
  chapterCode: string
  chapterDescription: string
  headingCode: string
  headingDescription: string
  leafCode: string
  leafDescription: string
  reasoning: string
  alternativeHeadings?: { code: string; description: string; note: string }[]
}

interface TariffTreeViewProps {
  tree: TariffTreeNode
  aiPath: TariffTreePath | null
  selectedHsCode: string | null
  onSelectCode: (code: string, description: string) => void
  selecting: boolean
}

// Check if any node in the subtree has the given code
function subtreeContainsCode(node: TariffTreeNode, targetCode: string): boolean {
  if (node.code === targetCode) return true
  if (node.children) {
    for (const child of node.children) {
      if (subtreeContainsCode(child, targetCode)) return true
    }
  }
  return false
}

function isOnAiPath(node: TariffTreeNode, aiPath: TariffTreePath | null): boolean {
  if (!aiPath) return false
  const code = node.code ?? ''
  if (code) {
    // Node has a code — check if it's a prefix of the AI leaf code or the leaf itself
    return aiPath.leafCode.startsWith(code)
  }
  // Description-only node — it's on the path if any descendant contains the AI leaf code
  return subtreeContainsCode(node, aiPath.leafCode)
}

function isAlternativeHeading(node: TariffTreeNode, aiPath: TariffTreePath | null): boolean {
  if (!aiPath?.alternativeHeadings) return false
  const code = node.code ?? ''
  if (code.length !== 4) return false
  return aiPath.alternativeHeadings.some((alt) => alt.code === code)
}

function getAlternativeNote(code: string, aiPath: TariffTreePath | null): string | null {
  if (!aiPath?.alternativeHeadings) return null
  const alt = aiPath.alternativeHeadings.find((a) => a.code === code)
  return alt?.note ?? null
}

function shouldAutoExpand(node: TariffTreeNode, aiPath: TariffTreePath | null, selectedHsCode: string | null): boolean {
  // Auto-expand to reveal the AI pick
  if (aiPath && subtreeContainsCode(node, aiPath.leafCode)) return true
  // Auto-expand alternative headings
  if (isAlternativeHeading(node, aiPath)) return true
  // Auto-expand to reveal the user-selected code (manual or from tree)
  if (selectedHsCode && subtreeContainsCode(node, selectedHsCode)) return true
  return false
}

function TreeNode({
  node,
  aiPath,
  selectedHsCode,
  onSelectCode,
  selecting,
  depth,
}: {
  node: TariffTreeNode
  aiPath: TariffTreePath | null
  selectedHsCode: string | null
  onSelectCode: (code: string, description: string) => void
  selecting: boolean
  depth: number
}) {
  const onPath = isOnAiPath(node, aiPath)
  const isAlt = isAlternativeHeading(node, aiPath)
  const autoExpand = shouldAutoExpand(node, aiPath, selectedHsCode)
  const [expanded, setExpanded] = React.useState(autoExpand)
  const code = node.code ?? ''
  const hasChildren = !!node.children?.length
  const isLeaf = code.length === 10
  const isSelected = selectedHsCode === code
  const isAiChoice = aiPath?.leafCode === code
  const isOnSelectedPath = selectedHsCode ? subtreeContainsCode(node, selectedHsCode) : false

  // When selectedHsCode changes, expand ancestors of the newly selected code
  React.useEffect(() => {
    if (selectedHsCode && hasChildren && subtreeContainsCode(node, selectedHsCode)) {
      setExpanded(true)
    }
  }, [selectedHsCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render the root section node's description as a tree node — just render its children
  if (depth === 0 && !code) {
    return (
      <>
        {node.children?.map((child, index) => (
          <TreeNode
            key={child.code ?? index}
            node={child}
            aiPath={aiPath}
            selectedHsCode={selectedHsCode}
            onSelectCode={onSelectCode}
            selecting={selecting}
            depth={depth + 1}
          />
        ))}
      </>
    )
  }

  const borderClass = isAiChoice
    ? 'border-l-2 border-green-500'
    : isSelected
      ? 'border-l-2 border-primary'
      : onPath
        ? 'border-l-2 border-green-300 dark:border-green-500/40'
        : isAlt
          ? 'border-l-2 border-amber-500/40'
          : isOnSelectedPath && !onPath
            ? 'border-l-2 border-primary/40'
            : depth > 1
              ? 'border-l border-border/40'
              : ''

  const bgClass = isAiChoice
    ? 'bg-green-50 dark:bg-green-500/10'
    : isSelected
      ? 'bg-primary/15'
      : ''

  return (
    <div className={`${borderClass} ${depth > 0 ? 'ml-4' : ''}`}>
      <div
        className={`flex items-start gap-2 py-1 px-2 rounded ${bgClass} ${hasChildren ? 'cursor-pointer hover:bg-muted/30' : ''} ${isLeaf && !isSelected ? 'cursor-pointer hover:bg-muted/20' : ''}`}
        onClick={() => {
          if (hasChildren) {
            setExpanded(!expanded)
          } else if (isLeaf && !isSelected) {
            onSelectCode(code, node.description)
          }
        }}
      >
        {/* Expand/collapse indicator */}
        {hasChildren && (
          <span className="text-xs text-muted-foreground mt-0.5 w-3 shrink-0">
            {expanded ? '\u25BC' : '\u25B6'}
          </span>
        )}
        {!hasChildren && <span className="w-3 shrink-0" />}

        {/* Code badge */}
        {code && (
          <span
            className={`font-mono text-xs px-1.5 py-0.5 rounded shrink-0 ${
              isAiChoice
                ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 font-bold'
                : isSelected
                  ? 'bg-primary/20 text-primary/80 font-bold'
                  : onPath
                    ? 'bg-green-50 dark:bg-green-500/10 text-green-600/80 dark:text-green-400/80'
                    : isAlt
                      ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600/80 dark:text-amber-400/80'
                      : 'bg-muted text-muted-foreground'
            }`}
          >
            {code}
          </span>
        )}

        {/* Description */}
        <span
          className={`text-sm flex-1 ${
            isAiChoice
              ? 'text-foreground font-medium'
              : onPath
                ? 'text-foreground/90'
                : isAlt
                  ? 'text-foreground/70'
                  : 'text-muted-foreground'
          }`}
        >
          {node.description}
        </span>

        {/* Indicators */}
        {isAiChoice && (
          <span className="text-xs bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 px-1.5 py-0.5 rounded shrink-0">
            AI pick
          </span>
        )}
        {isAlt && (
          <span className="text-xs bg-amber-500/15 text-amber-600/80 dark:text-amber-400/80 px-1.5 py-0.5 rounded shrink-0">
            considered
          </span>
        )}
        {isSelected && (
          <span className="text-xs bg-primary/20 text-primary/80 px-1.5 py-0.5 rounded font-medium shrink-0">&#10003; Selected</span>
        )}
        {isLeaf && !isSelected && !isAiChoice && (
          <button
            onClick={(event) => {
              event.stopPropagation()
              onSelectCode(code, node.description)
            }}
            disabled={selecting}
            className="text-xs border border-border rounded px-2 py-1 hover:bg-muted text-foreground disabled:opacity-50 shrink-0"
          >
            Select
          </button>
        )}
        {isLeaf && isAiChoice && !isSelected && (
          <button
            onClick={(event) => {
              event.stopPropagation()
              onSelectCode(code, node.description)
            }}
            disabled={selecting}
            className="text-xs bg-primary text-primary-foreground rounded px-2 py-1 hover:bg-primary/90 disabled:opacity-50 shrink-0"
          >
            Select
          </button>
        )}
      </div>

      {/* Alternative heading note */}
      {isAlt && expanded && (
        <div className="ml-9 px-2 pb-1">
          <span className="text-xs text-amber-600/80 dark:text-amber-400/60 italic">
            {getAlternativeNote(code, aiPath)}
          </span>
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div className="pb-0.5">
          {node.children!.map((child, index) => (
            <TreeNode
              key={child.code ?? index}
              node={child}
              aiPath={aiPath}
              selectedHsCode={selectedHsCode}
              onSelectCode={onSelectCode}
              selecting={selecting}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TariffTreeView({
  tree,
  aiPath,
  selectedHsCode,
  onSelectCode,
  selecting,
}: TariffTreeViewProps) {
  return (
    <div className="space-y-2">
      {/* Disclaimer */}
      <div className="rounded border border-border bg-muted/30 px-3 py-2">
        <p className="text-sm text-muted-foreground">
          AI highlights a path through the official EU Combined Nomenclature tree.
          The highlighted code is a suggestion — review alternatives and make the final classification decision.
        </p>
      </div>

      {/* AI reasoning */}
      {aiPath && (
        <div className="rounded border border-border bg-muted/20 px-3 py-2.5">
          <div className="text-sm font-medium text-foreground mb-1">AI reasoning:</div>
          <p className="text-sm text-foreground/80">{aiPath.reasoning}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Chapter: <span className="font-mono text-foreground/70">{aiPath.chapterCode}</span></span>
            <span>Heading: <span className="font-mono text-foreground/70">{aiPath.headingCode}</span></span>
            <span>Code: <span className="font-mono text-foreground/70">{aiPath.leafCode}</span></span>
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="rounded border border-border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/20">
          <span className="text-sm font-medium text-foreground">Tariff Tree — Chapter {aiPath?.chapterCode ?? '?'}</span>
          <span className="text-sm text-muted-foreground ml-2">
            (click headings to expand, click 10-digit codes to select)
          </span>
        </div>
        <div className="px-2 py-1 max-h-[500px] overflow-y-auto">
          <TreeNode
            node={tree}
            aiPath={aiPath}
            selectedHsCode={selectedHsCode}
            onSelectCode={onSelectCode}
            selecting={selecting}
            depth={0}
          />
        </div>
      </div>
    </div>
  )
}
