import { describe, expect, it, vi } from 'vitest'
import { queryReadPermission } from './fileAccess'

describe('unattended folder permission checks', () => {
  it('only queries read access and never prompts for expired permission', async () => {
    const queryPermission = vi.fn().mockResolvedValue('prompt')
    const requestPermission = vi.fn()
    const handle = { queryPermission, requestPermission } as unknown as FileSystemDirectoryHandle
    expect(await queryReadPermission(handle)).toBe(false)
    expect(queryPermission).toHaveBeenCalledWith({ mode: 'read' })
    expect(requestPermission).not.toHaveBeenCalled()
    queryPermission.mockResolvedValue('granted')
    expect(await queryReadPermission(handle)).toBe(true)
    expect(requestPermission).not.toHaveBeenCalled()
  })
  it('surfaces permission-check errors instead of assuming access', async () => {
    const handle = { queryPermission: vi.fn().mockRejectedValue(new Error('Disconnected')) } as unknown as FileSystemDirectoryHandle
    await expect(queryReadPermission(handle)).rejects.toThrow('Disconnected')
  })
})
