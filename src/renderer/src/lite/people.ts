import type { LiteFaceObservation, LiteMediaRecord, LitePersonRecord } from './types'

export const PEOPLE_CLUSTER_THRESHOLD = 0.62
const PRESERVE_ASSIGNMENT_THRESHOLD = 0.5

export interface LitePeopleStateResult {
  items: LiteMediaRecord[]
  changed: LiteMediaRecord[]
  people: LitePersonRecord[]
}

interface FaceEntry {
  item: LiteMediaRecord
  face: LiteFaceObservation
  ref: string
}

interface WorkingCluster {
  id: string
  template?: LitePersonRecord
  centroid: number[]
  sum: number[]
  count: number
  refs: string[]
}

export function faceReference(itemId: string, faceId: string): string {
  return `${itemId}#${faceId}`
}

export function clusterPeople(
  items: LiteMediaRecord[],
  existingPeople: LitePersonRecord[],
  now = Date.now(),
  createId: () => string = () => crypto.randomUUID()
): LitePeopleStateResult {
  const entries = collectFaces(items).sort((a, b) => a.ref.localeCompare(b.ref))
  const existingById = new Map(existingPeople.map((person) => [person.id, person]))
  const clusters = new Map<string, WorkingCluster>()

  for (const person of existingPeople) {
    if (person.centroid.length === 0) continue
    clusters.set(person.id, {
      id: person.id,
      template: person,
      centroid: [...person.centroid],
      sum: new Array(person.centroid.length).fill(0),
      count: 0,
      refs: []
    })
  }

  const assignments = new Map<string, string>()
  for (const entry of entries) {
    const embedding = normalizeEmbedding(entry.face.embedding)
    if (embedding.length === 0) continue

    let selected: WorkingCluster | undefined
    if (entry.face.personId) {
      const prior = clusters.get(entry.face.personId)
      if (prior && cosineSimilarity(embedding, prior.centroid) >= PRESERVE_ASSIGNMENT_THRESHOLD) selected = prior
    }

    if (!selected) {
      let bestScore = PEOPLE_CLUSTER_THRESHOLD
      for (const candidate of clusters.values()) {
        if (candidate.centroid.length !== embedding.length) continue
        const score = cosineSimilarity(embedding, candidate.centroid)
        if (score > bestScore) {
          bestScore = score
          selected = candidate
        }
      }
    }

    if (!selected) {
      const id = `person-${createId()}`
      selected = { id, centroid: embedding, sum: new Array(embedding.length).fill(0), count: 0, refs: [] }
      clusters.set(id, selected)
    }

    addToCluster(selected, embedding, entry.ref)
    assignments.set(entry.ref, selected.id)
  }

  const changed: LiteMediaRecord[] = []
  const nextItems = items.map((item) => {
    if (!item.faces?.length) return item
    let itemChanged = false
    const faces = item.faces.map((face) => {
      const personId = assignments.get(faceReference(item.id, face.id))
      if (personId === face.personId) return face
      itemChanged = true
      return { ...face, ...(personId ? { personId } : {}) }
    })
    if (!itemChanged) return item
    const updated = { ...item, faces }
    changed.push(updated)
    return updated
  })

  const people = [...clusters.values()]
    .filter((cluster) => cluster.count > 0)
    .map((cluster) => ({
      id: cluster.id,
      libraryId: entries[0]?.item.libraryId ?? cluster.template?.libraryId ?? '',
      name: cluster.template?.name,
      ignored: cluster.template?.ignored ?? false,
      faceRefs: [...cluster.refs].sort(),
      centroid: cluster.centroid.map(roundEmbeddingValue),
      createdAt: cluster.template?.createdAt ?? now,
      updatedAt: cluster.template && sameRefs(cluster.template.faceRefs, cluster.refs) ? cluster.template.updatedAt : now
    }))
    .sort((a, b) => b.faceRefs.length - a.faceRefs.length || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id))

  return { items: nextItems, changed, people }
}

export function renamePerson(people: LitePersonRecord[], personId: string, name: string, now = Date.now()): LitePersonRecord[] {
  const normalized = name.trim()
  return people.map((person) => person.id === personId ? { ...person, name: normalized || undefined, updatedAt: now } : person)
}

export function setPersonIgnored(people: LitePersonRecord[], personId: string, ignored: boolean, now = Date.now()): LitePersonRecord[] {
  return people.map((person) => person.id === personId ? { ...person, ignored, updatedAt: now } : person)
}

export function mergePeople(
  items: LiteMediaRecord[],
  people: LitePersonRecord[],
  sourceId: string,
  targetId: string,
  now = Date.now()
): LitePeopleStateResult {
  if (sourceId === targetId) return { items, changed: [], people }
  const source = people.find((person) => person.id === sourceId)
  const target = people.find((person) => person.id === targetId)
  if (!source || !target) return { items, changed: [], people }

  const changed: LiteMediaRecord[] = []
  const nextItems = items.map((item) => {
    if (!item.faces?.some((face) => face.personId === sourceId)) return item
    const updated = {
      ...item,
      faces: item.faces.map((face) => face.personId === sourceId ? { ...face, personId: targetId } : face)
    }
    changed.push(updated)
    return updated
  })

  const nextPeople = rebuildPeopleFromAssignments(nextItems, people.filter((person) => person.id !== sourceId), now)
  return { items: nextItems, changed, people: nextPeople }
}

export function splitFaceIntoNewPerson(
  items: LiteMediaRecord[],
  people: LitePersonRecord[],
  faceRef: string,
  now = Date.now(),
  createId: () => string = () => crypto.randomUUID()
): LitePeopleStateResult {
  const newId = `person-${createId()}`
  const changed: LiteMediaRecord[] = []
  const nextItems = items.map((item) => {
    if (!item.faces?.length) return item
    let didChange = false
    const faces = item.faces.map((face) => {
      if (faceReference(item.id, face.id) !== faceRef) return face
      didChange = true
      return { ...face, personId: newId }
    })
    if (!didChange) return item
    const updated = { ...item, faces }
    changed.push(updated)
    return updated
  })
  if (changed.length === 0) return { items, changed: [], people }

  const templates = [...people, {
    id: newId,
    libraryId: changed[0].libraryId,
    ignored: false,
    faceRefs: [],
    centroid: [],
    createdAt: now,
    updatedAt: now
  }]
  return { items: nextItems, changed, people: rebuildPeopleFromAssignments(nextItems, templates, now) }
}

export function peoplePhotoCounts(items: LiteMediaRecord[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const people = new Set((item.faces ?? []).map((face) => face.personId).filter(isString))
    for (const personId of people) counts.set(personId, (counts.get(personId) ?? 0) + 1)
  }
  return counts
}

export interface LitePersonPairCount {
  personIds: [string, string]
  photoCount: number
}

export function rarePersonPairs(items: LiteMediaRecord[]): LitePersonPairCount[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const ids = [...new Set((item.faces ?? []).map((face) => face.personId).filter(isString))].sort()
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const key = `${ids[left]}\u0000${ids[right]}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .map(([key, photoCount]) => ({ personIds: key.split('\u0000') as [string, string], photoCount }))
    .sort((a, b) => a.photoCount - b.photoCount || a.personIds.join().localeCompare(b.personIds.join()))
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }
  if (leftNorm === 0 || rightNorm === 0) return 0
  return dot / Math.sqrt(leftNorm * rightNorm)
}

function collectFaces(items: LiteMediaRecord[]): FaceEntry[] {
  const entries: FaceEntry[] = []
  for (const item of items) {
    for (const face of item.faces ?? []) {
      if (face.embedding.length === 0) continue
      entries.push({ item, face, ref: faceReference(item.id, face.id) })
    }
  }
  return entries
}

function addToCluster(cluster: WorkingCluster, embedding: number[], ref: string): void {
  if (cluster.sum.length !== embedding.length) cluster.sum = new Array(embedding.length).fill(0)
  for (let index = 0; index < embedding.length; index += 1) cluster.sum[index] += embedding[index]
  cluster.count += 1
  cluster.refs.push(ref)
  cluster.centroid = cluster.sum.map((value) => value / cluster.count)
}

function rebuildPeopleFromAssignments(items: LiteMediaRecord[], templates: LitePersonRecord[], now: number): LitePersonRecord[] {
  const templateById = new Map(templates.map((person) => [person.id, person]))
  const aggregates = new Map<string, { refs: string[]; sum: number[]; count: number; libraryId: string }>()
  for (const item of items) {
    for (const face of item.faces ?? []) {
      if (!face.personId || face.embedding.length === 0) continue
      const aggregate = aggregates.get(face.personId) ?? { refs: [], sum: new Array(face.embedding.length).fill(0), count: 0, libraryId: item.libraryId }
      if (aggregate.sum.length !== face.embedding.length) continue
      for (let index = 0; index < face.embedding.length; index += 1) aggregate.sum[index] += face.embedding[index]
      aggregate.count += 1
      aggregate.refs.push(faceReference(item.id, face.id))
      aggregates.set(face.personId, aggregate)
    }
  }

  return [...aggregates.entries()].map(([id, aggregate]) => {
    const template = templateById.get(id)
    return {
      id,
      libraryId: aggregate.libraryId,
      name: template?.name,
      ignored: template?.ignored ?? false,
      faceRefs: aggregate.refs.sort(),
      centroid: aggregate.sum.map((value) => roundEmbeddingValue(value / aggregate.count)),
      createdAt: template?.createdAt ?? now,
      updatedAt: now
    }
  }).sort((a, b) => b.faceRefs.length - a.faceRefs.length || a.id.localeCompare(b.id))
}

function normalizeEmbedding(embedding: number[]): number[] {
  if (embedding.length === 0) return []
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(norm) || norm === 0) return []
  return embedding.map((value) => value / norm)
}

function roundEmbeddingValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function sameRefs(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const sorted = [...right].sort()
  return left.every((value, index) => value === sorted[index])
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}
