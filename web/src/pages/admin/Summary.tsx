import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Space, Table, Tag, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  exportSummary,
  getSummary,
  type SummaryParams,
  type SummaryRow,
} from '../../api/evaluations'

const SUMMARY_COLUMNS: { title: keyof SummaryRow; width?: number }[] = [
  { title: '评审对象姓名', width: 120 },
  { title: '状态', width: 90 },
  { title: '修改时间', width: 170 },
  { title: '目标职级', width: 90 },
  { title: '评委姓名', width: 100 },
  { title: '评审日期', width: 170 },
  { title: '价值观平均分', width: 120 },
  { title: '能力模型平均分', width: 130 },
  { title: '工作成果平均分', width: 130 },
  { title: '最终总分', width: 90 },
  { title: '系统建议', width: 100 },
  { title: '评委确认结果', width: 120 },
  { title: '务实评分', width: 90 },
  { title: '担当评分', width: 90 },
  { title: '追求卓越评分', width: 110 },
  { title: '学习创新与效率提升评分', width: 180 },
  { title: '技术专业与质量评分', width: 150 },
  { title: '架构能力评分', width: 110 },
  { title: '业务理解能力评分', width: 140 },
  { title: '执行力评分', width: 90 },
  { title: '团队协作评分', width: 110 },
  { title: '知识传承与影响力评分', width: 170 },
  { title: '基础工作产出评分', width: 140 },
  { title: 'AI使用深度评分', width: 130 },
  { title: '突出优势', width: 200 },
  { title: '待发展项', width: 200 },
]

const SCORE_KEYS: (keyof SummaryRow)[] = [
  '价值观平均分',
  '能力模型平均分',
  '工作成果平均分',
  '最终总分',
  '务实评分',
  '担当评分',
  '追求卓越评分',
  '学习创新与效率提升评分',
  '技术专业与质量评分',
  '架构能力评分',
  '业务理解能力评分',
  '执行力评分',
  '团队协作评分',
  '知识传承与影响力评分',
  '基础工作产出评分',
  'AI使用深度评分',
]

function formatCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '-'
  return value
}

function groupKey(row: SummaryRow) {
  return `${row.评审对象姓名}::${row.评委姓名}`
}

export default function Summary() {
  const [form] = Form.useForm<SummaryParams>()
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [queryParams, setQueryParams] = useState<SummaryParams>({})

  const duplicateGroups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const key = groupKey(row)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return new Set([...counts.entries()].filter(([, n]) => n >= 2).map(([k]) => k))
  }, [rows])

  const rowBackground = useCallback(
    (row: SummaryRow): string | undefined => {
      const key = groupKey(row)
      if (duplicateGroups.has(key)) return '#fff7e6'
      if (row.评委确认结果 === '通过晋升') return '#f6ffed'
      if (row.评委确认结果 === '不通过晋升') return '#fff1f0'
      return undefined
    },
    [duplicateGroups],
  )

  const columns: ColumnsType<SummaryRow> = useMemo(
    () =>
      SUMMARY_COLUMNS.map(({ title, width }) => ({
        title,
        dataIndex: title,
        key: title,
        width,
        ellipsis: title === '突出优势' || title === '待发展项',
        render: (value: string | number | null, record: SummaryRow) => {
          if (title === '状态') {
            return (
              <Space size={4}>
                {formatCell(value as string)}
                {duplicateGroups.has(groupKey(record)) && (
                  <Tag color="orange">重复提交</Tag>
                )}
              </Space>
            )
          }
          return SCORE_KEYS.includes(title)
            ? formatCell(value)
            : formatCell(value as string | null)
        },
      })),
    [duplicateGroups],
  )

  const fetchSummary = useCallback(async (params: SummaryParams) => {
    setLoading(true)
    try {
      const data = await getSummary(params)
      setRows(data)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '查询失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearch = async () => {
    const values = await form.validateFields()
    const params: SummaryParams = {
      employee_name: values.employee_name?.trim() || undefined,
      reviewer_name: values.reviewer_name?.trim() || undefined,
    }
    setQueryParams(params)
    await fetchSummary(params)
  }

  const handleReset = () => {
    form.resetFields()
    setQueryParams({})
    fetchSummary({})
  }

  useEffect(() => {
    fetchSummary({})
  }, [fetchSummary])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportSummary(queryParams)
      message.success('导出成功')
    } catch {
      message.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <Form form={form} layout="inline" style={{ marginBottom: 16 }} onFinish={handleSearch}>
        <Form.Item name="employee_name" label="员工姓名">
          <Input placeholder="请输入员工姓名" allowClear style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="reviewer_name" label="评委姓名">
          <Input placeholder="请输入评委姓名" allowClear style={{ width: 180 }} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              查询
            </Button>
            <Button onClick={handleReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>

      <Space style={{ marginBottom: 16 }}>
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
          导出查询结果
        </Button>
      </Space>

      <Table
        rowKey={(record) => String(record.id)}
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
        onRow={(record) => ({
          style: { background: rowBackground(record) },
        })}
      />
    </div>
  )
}
