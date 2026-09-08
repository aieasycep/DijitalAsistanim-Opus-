import type { BadgeTone } from '@/components/ui'
import { type ActorBucket, type OutcomeBucket } from './contract'

/**
 * Presentation rules for the audit area.
 *
 * Tone is a claim about the row, not decoration. `critical` means the row
 * records something that failed or was refused; `warning` means it records a
 * privileged capability being used; everything else is a fact.
 */

export function actorTone(bucket: ActorBucket | 'diger'): BadgeTone {
  switch (bucket) {
    case 'ekip':
      return 'primary'
    case 'sistem':
      return 'info'
    case 'kullanici':
      return 'success'
    case 'isaretsiz':
      return 'neutral'
    case 'diger':
      return 'warning'
  }
}

export function outcomeTone(bucket: OutcomeBucket): BadgeTone {
  switch (bucket) {
    case 'basarili':
      return 'success'
    case 'hata':
      return 'critical'
    case 'belirtilmemis':
      return 'neutral'
  }
}

/** The bucket a raw `outcome` value falls into, for a row's badge. */
export function outcomeBucketOf(outcome: string | null): OutcomeBucket {
  if (outcome === null) return 'belirtilmemis'
  return outcome === 'success' ? 'basarili' : 'hata'
}

/**
 * Rows that record something going wrong, so the table can tint them.
 *
 * Deliberately narrow: a trail where half the rows are red is a trail nobody
 * scans. Only a non-success outcome and the two refusal actions qualify.
 */
export function rowTone(outcome: string | null, action: string | null): 'default' | 'critical' {
  if (outcome !== null && outcome !== 'success') return 'critical'
  if (action === 'staff.sign_in_denied') return 'critical'
  return 'default'
}

/** Long staff reasons are truncated in the table and shown whole in a tooltip. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
