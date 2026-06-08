import axios from 'axios'
import client, { getToken } from './client'

export const LEVELS = ['P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'] as const

export function nextTargetLevel(current: string): string | null {
  const idx = LEVELS.indexOf(current as (typeof LEVELS)[number])
  if (idx === -1 || idx === LEVELS.length - 1) return null
  return LEVELS[idx + 1]
}

export interface Employee {
  id: number
  employee_no: string
  name: string
  division_center: string | null
  department: string | null
  education: string | null
  position: string | null
  current_level: string
  target_level: string
  perf_fy24: string | null
  perf_fy25: string | null
  perf_fy25h1: string | null
  join_date: string | null
  remark: string | null
  nomination_status: string | null
  nomination_reason: string | null
  update_time: string
}

export interface EmployeePayload {
  employee_no: string
  name: string
  division_center?: string | null
  department?: string | null
  education?: string | null
  position?: string | null
  current_level: string
  target_level: string
  perf_fy24?: string | null
  perf_fy25?: string | null
  perf_fy25h1?: string | null
  join_date?: string | null
  remark?: string | null
  nomination_status?: string | null
  nomination_reason?: string | null
}

export async function listEmployees(name?: string): Promise<Employee[]> {
  const res = await client.get('/employees', { params: name ? { name } : {} })
  return res.data
}

export async function createEmployee(data: EmployeePayload): Promise<Employee> {
  const res = await client.post('/employees', data)
  return res.data
}

export async function updateEmployee(id: number, data: EmployeePayload): Promise<Employee> {
  const res = await client.put(`/employees/${id}`, data)
  return res.data
}

export async function deleteEmployee(id: number): Promise<void> {
  await client.delete(`/employees/${id}`)
}

export async function deleteAllEmployees(): Promise<void> {
  await client.delete('/employees/all')
}

export async function downloadTemplate(): Promise<Blob> {
  const res = await axios.get('/api/employees/template', {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  return res.data
}

export async function importEmployees(
  file: File,
): Promise<{ success: number; errors: { row: number; reason: string }[] }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await client.post('/employees/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function searchEmployees(
  q: string,
): Promise<{ id: number; name: string; employee_no: string }[]> {
  const res = await client.get('/employees/search', { params: { q } })
  return res.data
}
