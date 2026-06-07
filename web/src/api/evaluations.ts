import client from './client'
import type { Employee } from './employees'

export interface EvaluationRecord {
  id: number
  employee_id: number
  employee_name: string | null
  target_level: string | null
  reviewer_name: string
  status: string
  scores: (number | null)[]
  avg_values: number | null
  avg_capability: number | null
  avg_output: number | null
  final_score: number | null
  sys_suggestion: string | null
  reviewer_result: string | null
  advantage: string | null
  disadvantage: string | null
  create_time: string
  update_time: string
}

export interface LoadEvaluationResponse {
  employee: Employee
  record: EvaluationRecord | null
}

export interface DraftPayload {
  employee_id: number
  reviewer_name: string
  scores: (number | null)[]
  advantage?: string | null
  disadvantage?: string | null
}

export interface GeneratePayload extends DraftPayload {
  sys_suggestion: string
  reviewer_result: string
}

export async function loadEvaluation(
  employeeId: number,
  reviewerName: string,
): Promise<LoadEvaluationResponse> {
  const res = await client.get('/evaluations/load', {
    params: { employee_id: employeeId, reviewer_name: reviewerName },
  })
  return res.data
}

export async function saveDraft(data: DraftPayload): Promise<EvaluationRecord> {
  const res = await client.post('/evaluations/draft', data)
  return res.data
}

export async function generateResult(data: GeneratePayload): Promise<EvaluationRecord> {
  const res = await client.post('/evaluations/generate', data)
  return res.data
}

export async function submitEvaluation(recordId: number): Promise<EvaluationRecord> {
  const res = await client.post('/evaluations/submit', { record_id: recordId })
  return res.data
}
