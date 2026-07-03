import { useQuery } from '@tanstack/react-query'
import { performanceAPI, studentAPI, subjectAPI } from '../services/api'

export function useDashboardData() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [sumRes, dayRes, stRes, subRes] = await Promise.all([
        performanceAPI.getAllSummary(),
        performanceAPI.getDayAttendanceSummary(),
        studentAPI.getAll(),
        subjectAPI.getAll(),
      ])
      return {
        summary: sumRes.data,
        dayAtt: dayRes.data,
        students: stRes.data.students || [],
        subjects: subRes.data.subjects || [],
      }
    },
    staleTime: 60_000,
  })
}
