import axios from 'axios'
import client, { getToken } from './client'
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

export interface SummaryParams {
  employee_name?: string
  reviewer_name?: string
}

export interface SummaryRow {
  评审对象姓名: string
  状态: string
  修改时间: string
  目标职级: string
  评委姓名: string
  评审日期: string
  价值观平均分: number | null
  能力模型平均分: number | null
  工作成果平均分: number | null
  最终总分: number | null
  系统建议: string | null
  评委确认结果: string | null
  务实评分: number | null
  担当评分: number | null
  追求卓越评分: number | null
  学习创新与效率提升评分: number | null
  技术专业与质量评分: number | null
  架构能力评分: number | null
  业务理解能力评分: number | null
  执行力评分: number | null
  团队协作评分: number | null
  知识传承与影响力评分: number | null
  基础工作产出评分: number | null
  AI使用深度评分: number | null
  突出优势: string | null
  待发展项: string | null
}

export async function getSummary(params: SummaryParams): Promise<SummaryRow[]> {
  const res = await client.get('/evaluations/summary', { params })
  return res.data
}

export async function exportSummary(params: SummaryParams): Promise<void> {
  const searchParams = new URLSearchParams()
  if (params.employee_name) searchParams.set('employee_name', params.employee_name)
  if (params.reviewer_name) searchParams.set('reviewer_name', params.reviewer_name)
  const qs = searchParams.toString()
  const url = `/api/evaluations/export${qs ? `?${qs}` : ''}`
  const res = await axios.get(url, {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  const blob = res.data as Blob
  const downloadUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = downloadUrl
  a.download = 'evaluation_summary.xlsx'
  a.click()
  URL.revokeObjectURL(downloadUrl)
}
