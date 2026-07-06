import { useQuery } from '@tanstack/react-query'
import { mlAPI } from '../services/api'

export function useModelStatus() {
  return useQuery({
    queryKey: ['model-status'],
    queryFn: async () => (await mlAPI.modelStatus()).data,
    staleTime: 30_000,
  })
}
