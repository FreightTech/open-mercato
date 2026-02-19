'use client'

import * as React from 'react'

/**
 * Theme color overrides that map to CSS custom properties
 */
export interface ThemeColors {
  background?: string
  foreground?: string
  primary?: string
  primaryForeground?: string
  secondary?: string
  secondaryForeground?: string
  accent?: string
  accentForeground?: string
  muted?: string
  mutedForeground?: string
  border?: string
  card?: string
  cardForeground?: string
  sidebar?: string
  sidebarForeground?: string
  sidebarPrimary?: string
  sidebarPrimaryForeground?: string
  sidebarAccent?: string
  sidebarAccentForeground?: string
  sidebarBorder?: string
}

export interface ThemeProviderProps {
  children: React.ReactNode
  /** Base theme color overrides (applied to both modes unless overridden) */
  colors?: ThemeColors
  /** Light mode specific colors (merged on top of base colors) */
  light?: ThemeColors
  /** Dark mode specific colors (merged on top of base colors) */
  dark?: ThemeColors
}

/**
 * Maps theme color keys to CSS custom property names
 */
const colorToCssVar: Record<keyof ThemeColors, string> = {
  background: '--background',
  foreground: '--foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  border: '--border',
  card: '--card',
  cardForeground: '--card-foreground',
  sidebar: '--sidebar',
  sidebarForeground: '--sidebar-foreground',
  sidebarPrimary: '--sidebar-primary',
  sidebarPrimaryForeground: '--sidebar-primary-foreground',
  sidebarAccent: '--sidebar-accent',
  sidebarAccentForeground: '--sidebar-accent-foreground',
  sidebarBorder: '--sidebar-border',
}

/**
 * Theme provider that applies custom CSS variables for brand theming.
 * Colors are applied as CSS custom properties on a wrapper element.
 *
 * Supports separate light/dark mode color sets:
 * - `colors`: Base colors applied to both modes
 * - `light`: Light mode specific colors (merged on top of base)
 * - `dark`: Dark mode specific colors (merged on top of base)
 */
export function BrandThemeProvider({ children, colors, light, dark }: ThemeProviderProps) {
  const { resolvedTheme } = useTheme()

  const style = React.useMemo(() => {
    // Merge: base colors + mode-specific colors (mode takes precedence)
    const modeColors = resolvedTheme === 'dark' ? dark : light
    const merged = { ...colors, ...modeColors }

    if (!Object.keys(merged).length) return undefined

    const cssVars: Record<string, string> = {}
    for (const [key, value] of Object.entries(merged)) {
      if (value && key in colorToCssVar) {
        cssVars[colorToCssVar[key as keyof ThemeColors]] = value
      }
    }
    return Object.keys(cssVars).length > 0 ? cssVars : undefined
  }, [colors, light, dark, resolvedTheme])

  if (!style) {
    return <>{children}</>
  }

  return (
    <div style={style as React.CSSProperties} className="contents">
      {children}
    </div>
  )
}
export type Theme = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

const THEME_STORAGE_KEY = 'om-theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch (error) {
    // localStorage may be unavailable in private browsing, iframes, or restricted contexts
    // Theme will default to system preference - this is expected graceful degradation
    if (process.env.NODE_ENV === 'development') {
      console.warn('[ThemeProvider] localStorage read failed:', error)
    }
  }
  return 'system'
}

function applyTheme(resolvedTheme: 'light' | 'dark') {
  const root = document.documentElement
  if (resolvedTheme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = React.useState(false)

  // Initialize theme from localStorage on mount
  React.useEffect(() => {
    const stored = getStoredTheme()
    setThemeState(stored)
    const resolved = stored === 'system' ? getSystemTheme() : stored
    setResolvedTheme(resolved)
    applyTheme(resolved)
    setMounted(true)
  }, [])

  // Listen for system theme changes
  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') {
        const newResolved = getSystemTheme()
        setResolvedTheme(newResolved)
        applyTheme(newResolved)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch (error) {
      // localStorage may be unavailable - theme still works for this session, just won't persist
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ThemeProvider] localStorage write failed:', error)
      }
    }
    const resolved = newTheme === 'system' ? getSystemTheme() : newTheme
    setResolvedTheme(resolved)
    applyTheme(resolved)
  }, [])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  // Prevent flash of wrong theme during hydration
  if (!mounted) {
    return <>{children}</>
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext)
  if (context === undefined) {
    // Return safe defaults when not in provider (e.g., server render)
    return {
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: () => {},
    }
  }
  return context
}

