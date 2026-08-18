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

const activities = new Map<string, GlobalProcessActivity>()
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

export function startGlobalProcess(label: string, initial: Partial<Omit<GlobalProcessActivity, 'id' | 'label' | 'startedAt'>> = {}): GlobalProcessHandle {
  const id = `process-${Date.now().toString(36)}-${(++sequence).toString(36)}`
  activities.set(id, { id, label, startedAt: Date.now(), ...initial })
  publish()
  let finished = false
  return {
    id,
    update(update) {
      if (finished) return
      const current = activities.get(id)
      if (!current) return
      activities.set(id, { ...current, ...update })
      publish()
    },
    finish() {
      if (finished) return
      finished = true
      activities.delete(id)
      publish()
    }
  }
}

export async function withGlobalProcess<T>(
  label: string,
  work: (process: GlobalProcessHandle) => Promise<T>,
  initial: Partial<Omit<GlobalProcessActivity, 'id' | 'label' | 'startedAt'>> = {}
): Promise<T> {
  const process = startGlobalProcess(label, initial)
  try {
    return await work(process)
  } finally {
    process.finish()
  }
}
