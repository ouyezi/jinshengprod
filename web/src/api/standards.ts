import client from './client'

export const DIMENSION_FIELDS = [
  'pragmatic_desc',
  'responsibility_desc',
  'excellence_desc',
  'innovation_desc',
  'quality_desc',
  'architecture_desc',
  'business_desc',
  'execution_desc',
  'teamwork_desc',
  'influence_desc',
  'output_desc',
  'ai_depth_desc',
] as const

export const DIMENSION_LABELS = [
  '务实',
  '担当',
  '追求卓越',
  '学习创新与效率提升',
  '技术专业与质量',
  '架构能力',
  '业务理解能力',
  '执行力',
  '团队协作',
  '知识传承与影响力',
  '基础工作产出',
  'AI使用深度',
] as const

export type DimensionField = (typeof DIMENSION_FIELDS)[number]

export interface StandardData {
  level: string
  pragmatic_desc: string
  responsibility_desc: string
  excellence_desc: string
  innovation_desc: string
  quality_desc: string
  architecture_desc: string
  business_desc: string
  execution_desc: string
  teamwork_desc: string
  influence_desc: string
  output_desc: string
  ai_depth_desc: string
}

export type StandardUpdate = Omit<StandardData, 'level'>

export async function getStandard(level: string): Promise<StandardData> {
  const res = await client.get(`/standards/${level}`)
  return res.data
}

export async function updateStandard(level: string, data: StandardUpdate): Promise<StandardData> {
  const res = await client.put(`/standards/${level}`, data)
  return res.data
}
