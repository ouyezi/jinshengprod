import axios from 'axios'
import client, { getToken } from './client'

export const LEVELS = ['P5', 'P6', 'P7', 'P8', 'P9', 'P10'] as const

export interface Employee {
  id: number
  name: string
  current_level: string
  target_level: string
  performance_history: string | null
  update_time: string
}

export interface EmployeePayload {
  name: string
  current_level: string
  target_level: string
  performance_history?: string | null
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

export async function searchEmployees(q: string): Promise<{ id: number; name: string }[]> {
  const res = await client.get('/employees/search', { params: { q } })
  return res.data
}
