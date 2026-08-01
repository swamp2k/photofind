import { createContext, useContext, type ReactNode } from 'react'

interface SourceNavigationValue {
  showFolder(folder: string): void
}

const SourceNavigationContext = createContext<SourceNavigationValue | null>(null)

export function SourceNavigationProvider({ showFolder, children }: { showFolder(folder: string): void; children: ReactNode }): JSX.Element {
  return <SourceNavigationContext.Provider value={{ showFolder }}>{children}</SourceNavigationContext.Provider>
}

export function useSourceNavigation(): SourceNavigationValue | null {
  return useContext(SourceNavigationContext)
}
