"use client"

import * as React from 'react'
import CodeEditorLib from '@uiw/react-textarea-code-editor'

export interface CodeEditorHandle {
  insertAtCursor: (text: string) => void
  focus: () => void
}

type CodeEditorProps = {
  value: string
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  disabled?: boolean
  rows?: number
  placeholder?: string
  id?: string
}

/**
 * HTML code editor with syntax highlighting and cursor insertion support
 */
export const CodeEditor = React.forwardRef<CodeEditorHandle, CodeEditorProps>(
  ({ value, onChange, disabled, rows = 15, placeholder, id }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)

    React.useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        const textarea = textareaRef.current
        if (!textarea) return

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const currentValue = textarea.value

        let newValue: string
        let newCursorPos: number

        if (start !== end) {
          // Text is selected - wrap it or use as placeholder replacement
          const selectedText = currentValue.substring(start, end)
          
          // Handle template insertion with placeholders
          if (text.includes('CONTENT')) {
            newValue = currentValue.substring(0, start) + 
                      text.replace('CONTENT', selectedText) + 
                      currentValue.substring(end)
            newCursorPos = start + text.indexOf('CONTENT') + selectedText.length
          } else {
            // Simple replacement: selected text is replaced with the tag
            newValue = currentValue.substring(0, start) + 
                      text + 
                      currentValue.substring(end)
            newCursorPos = start + text.length
          }
        } else {
          // No selection - insert at cursor
          newValue = currentValue.substring(0, start) + text + currentValue.substring(start)
          
          // Position cursor after tag or at first placeholder
          if (text.includes('CONDITION') || text.includes('ARRAY') || text.includes('PROPERTY')) {
            // Position cursor at first placeholder for easy editing
            const placeholderMatch = text.match(/CONDITION|ARRAY|PROPERTY/)
            if (placeholderMatch && placeholderMatch.index !== undefined) {
              newCursorPos = start + placeholderMatch.index
            } else {
              newCursorPos = start + text.length
            }
          } else {
            newCursorPos = start + text.length
          }
        }

        // Create synthetic event
        const syntheticEvent = {
          target: { value: newValue },
          currentTarget: { value: newValue },
        } as React.ChangeEvent<HTMLTextAreaElement>

        onChange(syntheticEvent)

        // Update cursor position after React renders
        setTimeout(() => {
          if (textarea) {
            textarea.setSelectionRange(newCursorPos, newCursorPos)
            textarea.focus()
          }
        }, 0)
      },
      
      focus: () => {
        textareaRef.current?.focus()
      },
    }))

    return (
      <div className="rounded-md border border-input bg-background overflow-hidden">
        <CodeEditorLib
          ref={textareaRef}
          id={id}
          value={value}
          language="html"
          placeholder={placeholder}
          onChange={onChange}
          disabled={disabled}
          padding={12}
          minHeight={rows ? rows * 24 : 360}
          style={{
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
          }}
          className="!bg-background !text-foreground [&>pre]:!text-foreground dark:[&_.token.tag]:!text-sky-400 dark:[&_.token.attr-name]:!text-yellow-400 dark:[&_.token.attr-value]:!text-green-400 dark:[&_.token.punctuation]:!text-gray-400 dark:[&_.token.special-attr]:!text-sky-400"
        />
      </div>
    )
  }
)

CodeEditor.displayName = 'CodeEditor'
