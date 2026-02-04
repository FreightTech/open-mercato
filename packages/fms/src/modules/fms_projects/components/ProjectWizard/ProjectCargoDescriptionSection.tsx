'use client'

import * as React from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Pencil, Loader2 } from 'lucide-react'
import type { Project } from './hooks/useProjectWizard'

type ProjectCargoDescriptionSectionProps = {
  project: Project
  onUpdate: (updates: Partial<Project>) => void
}

export function ProjectCargoDescriptionSection({
  project,
  onUpdate,
}: ProjectCargoDescriptionSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [description, setDescription] = useState(project.commodityDescription || '')
  const [savedDescription, setSavedDescription] = useState(project.commodityDescription || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync local state when project changes (e.g., from external updates)
  useEffect(() => {
    if (!isSaving) {
      setDescription(project.commodityDescription || '')
      setSavedDescription(project.commodityDescription || '')
    }
  }, [project.commodityDescription, isSaving])

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  // Handle save and exit edit mode
  const handleSave = useCallback(() => {
    const newValue = description.trim() || null
    setIsEditing(false)

    if (newValue !== project.commodityDescription) {
      setIsSaving(true)
      setSavedDescription(newValue || '')
      onUpdate({ commodityDescription: newValue })
      // Clear saving state after a short delay to show feedback
      setTimeout(() => setIsSaving(false), 500)
    }
  }, [description, project.commodityDescription, onUpdate])

  // Handle change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
  }, [])

  // Handle key events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDescription(project.commodityDescription || '')
      setIsEditing(false)
    }
  }, [project.commodityDescription])

  // Enter edit mode
  const handleEdit = useCallback(() => {
    if (!isSaving) {
      setIsEditing(true)
    }
  }, [isSaving])

  // Show savedDescription during save to avoid flicker
  const displayText = isSaving ? savedDescription : (project.commodityDescription || '')

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-1.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Cargo Description</h3>
          {isSaving && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
        </div>
        {!isEditing && !isSaving && (
          <button
            onClick={handleEdit}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="px-3 py-2">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={description}
            onChange={handleChange}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder="Enter cargo description..."
            className="w-full min-h-[60px] p-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            rows={3}
          />
        ) : (
          <div
            onClick={handleEdit}
            className={`text-sm rounded px-2 py-1.5 -mx-2 transition-colors min-h-[32px] ${
              isSaving ? 'opacity-70' : 'cursor-pointer hover:bg-muted/50'
            }`}
          >
            {displayText ? (
              <span className="whitespace-pre-wrap">{displayText}</span>
            ) : (
              <span className="text-muted-foreground italic">Click to add cargo description...</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
