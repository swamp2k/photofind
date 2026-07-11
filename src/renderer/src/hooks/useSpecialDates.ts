import { useCallback, useEffect, useState } from 'react'
import type { NewSpecialDate, SpecialDate } from '../../../shared/types'

export interface SpecialDatesState {
  dates: SpecialDate[]
  error: string | null
  add: (date: NewSpecialDate) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function useSpecialDates(): SpecialDatesState {
  const [dates, setDates] = useState<SpecialDate[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .listSpecialDates()
      .then((loaded) => {
        if (!cancelled) setDates(loaded)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const add = useCallback(async (date: NewSpecialDate) => {
    setError(null)
    try {
      const created = await window.api.addSpecialDate(date)
      setDates((current) => [...current, created])
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    setError(null)
    let removed: SpecialDate | undefined
    setDates((current) => {
      removed = current.find((date) => date.id === id)
      return current.filter((date) => date.id !== id)
    })
    try {
      await window.api.removeSpecialDate(id)
    } catch (err) {
      if (removed) setDates((current) => [...current, removed!])
      setError((err as Error).message)
    }
  }, [])

  return { dates, error, add, remove }
}
