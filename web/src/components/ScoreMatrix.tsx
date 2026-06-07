import { Select, Table } from 'antd'
import { DIMENSION_LABELS } from '../api/standards'

const SCORE_OPTIONS = [
  { value: 1, label: '1-完全不符合' },
  { value: 2, label: '2-较不符合' },
  { value: 3, label: '3-基本符合' },
  { value: 4, label: '4-比较符合' },
  { value: 5, label: '5-非常符合' },
]

const GROUPS = [
  { name: '价值观', weight: '20%', start: 0, count: 3 },
  { name: '能力模型', weight: '40%', start: 3, count: 7 },
  { name: '工作成果', weight: '40%', start: 10, count: 2 },
] as const

interface ScoreMatrixProps {
  scores: (number | null)[]
  onChange: (scores: (number | null)[]) => void
  standards: string[]
  disabled?: boolean
  highlightScores?: boolean[]
}

interface RowData {
  key: number
  index: number
  groupName?: string
  groupWeight?: string
  groupRowSpan?: number
  label: string
  standard: string
  score: number | null
}

export default function ScoreMatrix({
  scores,
  onChange,
  standards,
  disabled = false,
  highlightScores,
}: ScoreMatrixProps) {
  const rows: RowData[] = []

  GROUPS.forEach((group) => {
    for (let i = 0; i < group.count; i++) {
      const index = group.start + i
      rows.push({
        key: index,
        index,
        groupName: i === 0 ? `${group.name} (${group.weight})` : undefined,
        groupRowSpan: i === 0 ? group.count : 0,
        label: DIMENSION_LABELS[index],
        standard: standards[index] ?? '',
        score: scores[index],
      })
    }
  })

  const handleScoreChange = (index: number, value: number | null) => {
    const next = [...scores]
    next[index] = value
    onChange(next)
  }

  return (
    <Table<RowData>
      dataSource={rows}
      pagination={false}
      bordered
      size="middle"
      columns={[
        {
          title: '主要维度',
          dataIndex: 'groupName',
          width: 140,
          onCell: (record) => ({
            rowSpan: record.groupRowSpan ?? 0,
          }),
          render: (text: string | undefined) => text ?? null,
        },
        {
          title: '维度组成',
          dataIndex: 'label',
          width: 180,
        },
        {
          title: '目标职级胜任要求',
          dataIndex: 'standard',
          render: (text: string) => (
            <span style={{ whiteSpace: 'pre-wrap', textAlign: 'left', display: 'block' }}>
              {text || '—'}
            </span>
          ),
        },
        {
          title: '维度打分',
          dataIndex: 'score',
          width: 180,
          render: (_: number | null, record: RowData) => (
            <Select
              style={{
                width: '100%',
                ...(highlightScores?.[record.index] ? { borderColor: '#ff4d4f' } : {}),
              }}
              placeholder="请选择"
              allowClear
              disabled={disabled}
              value={record.score ?? undefined}
              options={SCORE_OPTIONS}
              status={highlightScores?.[record.index] ? 'error' : undefined}
              onChange={(v) => handleScoreChange(record.index, v ?? null)}
            />
          ),
        },
      ]}
    />
  )
}
