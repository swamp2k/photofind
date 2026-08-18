import { useSyncExternalStore } from 'react'

export interface GlobalProcessActivity {
  id: string
  label: string
  detail?: string
  complete?: number
  total?: number
  startedAt: number
}

export interface GlobalProcessHandle {
  id: string
  update(update: Partial<Omit<GlobalProcessActivity, 'id' | 'startedAt'>>): void
  finish(): void
}

interface GlobalProcessOptions {
  delayMs?: number
}

const activities = new Map<string, GlobalProcessActivity>()
const pendingActivities = new Map<string, GlobalProcessActivity>()
const pendingTimers = new Map<string, number>()
const listeners = new Set<() => void>()
let sequence = 0
let snapshot: GlobalProcessActivity[] = []

function publish(): void {
  snapshot = [...activities.values()].sort((left, right) => left.startedAt - right.startedAt)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): GlobalProcessActivity[] {
  return snapshot
}

export function useGlobalProcesses(): GlobalProcessActivity[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function startGlobalProcess(
  label: string,
  initial: Partial<Omit<GlobalProcessActivity, 'id' | 'label' | 'startedAt'>> = {},
  options: GlobalProcessOptions = {}
): GlobalProcessHandle {
  const id = `process-${Date.now().toString(36)}-${(++sequence).toString(36)}`
  const activity: GlobalProcessActivity = { id, label, startedAt: Date.now(), ...initial }
  const delayMs = Math.max(0, options.delayMs ?? 0)
  if (delayMs > 0) {
    pendingActivities.set(id, activity)
    pendingTimers.set(id, window.setTimeout(() => {
      pendingTimers.delete(id)
      const pending = pendingActivities.get(id)
      if (!pending) return
      pendingActivities.delete(id)
      activities.set(id, pending)
      publish()
    }, delayMs))
  } else {
    activities.set(id, activity)
    publish()
  }

  let finished = false
  return {
    id,
    update(update) {
      if (finished) return
      const active = activities.get(id)
      if (active) {
        activities.set(id, { ...active, ...update })
        publish()
        return
      }
      const pending = pendingActivities.get(id)
      if (pending) pendingActivities.set(id, { ...pending, ...update })
    },
    finish() {
      if (finished) return
      finished = true
      const timer = pendingTimers.get(id)
      if (timer !== undefined) window.clearTimeout(timer)
      pendingTimers.delete(id)
      pendingActivities.delete(id)
      const wasVisible = activities.delete(id)
      if (wasVisible) publish()
    }
  }
}

export async function withGlobalProcess<T>(
  label: string,
  work: (process: GlobalProcessHandle) => Promise<T>,
  initial: Partial<Omit<GlobalProcessActivity, 'id' | 'label' | 'startedAt'>> = {},
  options: GlobalProcessOptions = {}
): Promise<T> {
  const process = startGlobalProcess(label, initial, options)
  try {
    return await work(process)
  } finally {
    process.finish()
  }
}
