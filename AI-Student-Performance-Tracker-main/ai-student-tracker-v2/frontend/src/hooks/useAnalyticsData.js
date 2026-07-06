import { useQuery } from '@tanstack/react-query'
import { mlAPI, performanceAPI } from '../services/api'

export function useAnalyticsData() {
  return useQuery({
    queryKey: ['analytics'],
    queryFn: async () => {
      const [summaryRes, analyticsRes, modelRes] = await Promise.all([
        performanceAPI.getAllSummary(),
        mlAPI.classAnalytics(),
        mlAPI.modelStatus(),
      ])
      return {
        summary: summaryRes.data,
        analytics: analyticsRes.data,
        model: modelRes.data,
      }
    },
    staleTime: 60_000,
  })
}
