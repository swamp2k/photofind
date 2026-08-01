import { describe, expect, it } from 'vitest'
import { clusterPeople, faceReference, mergePeople, rarePersonPairs, renamePerson, splitFaceIntoNewPerson } from './people'
import type { LiteFaceObservation, LiteMediaRecord, LitePersonRecord } from './types'

function face(id: string, embedding: number[], personId?: string): LiteFaceObservation {
  return { id, box: [0.1, 0.1, 0.3, 0.3], confidence: 0.9, embedding, ...(personId ? { personId } : {}) }
}

function photo(id: string, faces: LiteFaceObservation[]): LiteMediaRecord {
  return {
    id: `library:${id}`,
    libraryId: 'library',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 10,
    lastModified: 100,
    mimeType: 'image/jpeg',
    faces
  }
}

function person(id: string, centroid: number[], refs: string[] = []): LitePersonRecord {
  return { id, libraryId: 'library', ignored: false, centroid, faceRefs: refs, createdAt: 1, updatedAt: 1 }
}

describe('people clustering', () => {
  it('clusters similar faces and separates dissimilar faces', () => {
    let id = 0
    const result = clusterPeople([
      photo('a', [face('a1', [1, 0, 0])]),
      photo('b', [face('b1', [0.99, 0.05, 0])]),
      photo('c', [face('c1', [0, 1, 0])])
    ], [], 10, () => String(++id))

    expect(result.people).toHaveLength(2)
    const firstId = result.items[0].faces?.[0].personId
    expect(result.items[1].faces?.[0].personId).toBe(firstId)
    expect(result.items[2].faces?.[0].personId).not.toBe(firstId)
  })

  it('preserves a named existing person when embeddings still match', () => {
    const existing = { ...person('person-known', [1, 0]), name: 'Balder' }
    const result = clusterPeople([photo('a', [face('a1', [0.99, 0.01])])], [existing], 10, () => 'new')
    expect(result.people[0].id).toBe('person-known')
    expect(result.people[0].name).toBe('Balder')
  })

  it('merges and splits assignments without losing reversibility', () => {
    const items = [
      photo('a', [face('a1', [1, 0], 'person-a')]),
      photo('b', [face('b1', [0, 1], 'person-b')])
    ]
    const people = [
      { ...person('person-a', [1, 0], [faceReference(items[0].id, 'a1')]), name: 'A' },
      { ...person('person-b', [0, 1], [faceReference(items[1].id, 'b1')]), name: 'B' }
    ]

    const merged = mergePeople(items, people, 'person-b', 'person-a', 20)
    expect(merged.people).toHaveLength(1)
    expect(merged.items[1].faces?.[0].personId).toBe('person-a')

    const split = splitFaceIntoNewPerson(merged.items, merged.people, faceReference(items[1].id, 'b1'), 30, () => 'split')
    expect(split.people).toHaveLength(2)
    expect(split.items[1].faces?.[0].personId).toBe('person-split')
  })

  it('renames people and finds rare co-occurrences', () => {
    const renamed = renamePerson([person('person-a', [1, 0])], 'person-a', ' Randi ', 12)
    expect(renamed[0].name).toBe('Randi')

    const pairs = rarePersonPairs([
      photo('a', [face('1', [1], 'person-a'), face('2', [1], 'person-b')]),
      photo('b', [face('1', [1], 'person-a'), face('2', [1], 'person-b')]),
      photo('c', [face('1', [1], 'person-a'), face('3', [1], 'person-c')])
    ])
    expect(pairs[0]).toEqual({ personIds: ['person-a', 'person-c'], photoCount: 1 })
  })
})
