'use client'

import { useCallback, useEffect, useState } from 'react'
import { THEME_STORAGE_KEY } from '@/components/ThemeScript'

type ThemeChoice = 'system' | 'light' | 'dark'

const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark']

const LABELS: Record<ThemeChoice, string> = {
  system: 'Sistem teması',
  light: 'Açık tema',
  dark: 'Koyu tema',
}

const NEXT_LABELS: Record<ThemeChoice, string> = {
  system: 'açık temaya geç',
  light: 'koyu temaya geç',
  dark: 'sistem temasına geç',
}

const readStored = (): ThemeChoice => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

const applyChoice = (choice: ThemeChoice): void => {
  const root = document.documentElement
  if (choice === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', choice)
  }
  try {
    if (choice === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, choice)
    }
  } catch {
    // Private mode or blocked storage: the in-memory choice still applies.
  }
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setChoice(readStored())
    setMounted(true)
  }, [])

  const cycle = useCallback(() => {
    setChoice((current) => {
      const index = ORDER.indexOf(current)
      const next = ORDER[(index + 1) % ORDER.length] ?? 'system'
      applyChoice(next)
      return next
    })
  }, [])

  const label = mounted ? LABELS[choice] : LABELS.system
  const hint = mounted ? NEXT_LABELS[choice] : NEXT_LABELS.system

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${label} açık. Dokunarak ${hint}.`}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-muted transition-colors hover:text-ink"
    >
      <span aria-hidden="true" className="block">
        {choice === 'light' ? <SunIcon /> : choice === 'dark' ? <MoonIcon /> : <AutoIcon />}
      </span>
    </button>
  )
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path
        strokeLinecap="round"
        d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path strokeLinejoin="round" d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
    </svg>
  )
}

function AutoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6a8.4 8.4 0 0 1 0 16.8Z" fill="currentColor" stroke="none" />
    </svg>
  )
}
