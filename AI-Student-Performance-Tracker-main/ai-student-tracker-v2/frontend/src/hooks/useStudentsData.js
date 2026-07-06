import { useQuery } from '@tanstack/react-query'
import { performanceAPI, studentAPI } from '../services/api'

export function useStudentsData(styleFilter = '') {
  return useQuery({
    queryKey: ['students', { learning_style: styleFilter || null }],
    queryFn: async () => {
      const params = {}
      if (styleFilter) params.learning_style = styleFilter
      const [stRes, sumRes] = await Promise.all([
        studentAPI.getAll(params),
        performanceAPI.getAllSummary(),
      ])
      const students = stRes.data.students || []
      const riskMap = {}
      ;(sumRes.data.students || []).forEach((s) => {
        riskMap[s.id] = s.risk_level
      })
      return { students, riskMap }
    },
    staleTime: 60_000,
  })
}
