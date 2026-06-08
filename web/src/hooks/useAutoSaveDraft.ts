import { message } from 'antd'
import { useCallback, useEffect, useRef } from 'react'
import { saveDraft, type DraftPayload, type EvaluationRecord } from '../api/evaluations'

const DEBOUNCE_MS = 1500

export type SaveStatus = 'idle' | 'saving' | 'saved'

interface UseAutoSaveDraftOptions {
  enabled: boolean
  payload: DraftPayload | null
  onSaved: (record: EvaluationRecord) => void
  setSaveStatus: (status: SaveStatus) => void
}

export function useAutoSaveDraft({
  enabled,
  payload,
  onSaved,
  setSaveStatus,
}: UseAutoSaveDraftOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef('')
  const payloadRef = useRef<DraftPayload | null>(payload)
  payloadRef.current = payload

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const currentPayload = payloadRef.current
    if (!enabled || !currentPayload) return
    const key = JSON.stringify(currentPayload)
    if (key === lastSavedRef.current) return

    setSaveStatus('saving')
    try {
      const record = await saveDraft(currentPayload)
      lastSavedRef.current = key
      onSaved(record)
      setSaveStatus('saved')
      if (resetStatusTimerRef.current) {
        clearTimeout(resetStatusTimerRef.current)
      }
      resetStatusTimerRef.current = window.setTimeout(() => {
        setSaveStatus('idle')
      }, 3000)
    } catch (err) {
      setSaveStatus('idle')
      message.error(err instanceof Error ? err.message : '自动保存失败')
    }
  }, [enabled, onSaved, setSaveStatus])

  useEffect(() => {
    if (!enabled || !payload) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => void flush(), DEBOUNCE_MS)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, payload, flush])

  useEffect(() => {
    const onBeforeUnload = () => {
      void flush()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [flush])

  useEffect(
    () => () => {
      if (resetStatusTimerRef.current) {
        clearTimeout(resetStatusTimerRef.current)
      }
    },
    [],
  )

  return { flush }
}
