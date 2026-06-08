import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AutoComplete,
  Button,
  Card,
  Collapse,
  Descriptions,
  Input,
  Modal,
  Space,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { searchEmployees } from '../../api/employees'
import { DIMENSION_FIELDS, getStandard } from '../../api/standards'
import {
  generateResult,
  loadEvaluation,
  saveDraft,
  submitEvaluation,
  type EvaluationRecord,
} from '../../api/evaluations'
import type { Employee } from '../../api/employees'
import ScoreMatrix from '../../components/ScoreMatrix'
import { calculateScores, suggestResult } from '../../utils/scoring'

const { Title, Text, Paragraph } = Typography

const EMPTY_SCORES: (number | null)[] = Array(12).fill(null)

function applyRecord(
  record: EvaluationRecord | null,
  setters: {
    setScores: (s: (number | null)[]) => void
    setAdvantage: (v: string) => void
    setDisadvantage: (v: string) => void
    setStatus: (s: string | null) => void
    setRecordId: (id: number | null) => void
  },
) {
  if (record) {
    setters.setScores([...record.scores])
    setters.setAdvantage(record.advantage ?? '')
    setters.setDisadvantage(record.disadvantage ?? '')
    setters.setStatus(record.status)
    setters.setRecordId(record.id)
  } else {
    setters.setScores([...EMPTY_SCORES])
    setters.setAdvantage('')
    setters.setDisadvantage('')
    setters.setStatus('待提交')
    setters.setRecordId(null)
  }
}

export default function Evaluation() {
  const [reviewerName, setReviewerName] = useState('')
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [searchOptions, setSearchOptions] = useState<{ value: string; label: string; id: number }[]>(
    [],
  )
  const [scores, setScores] = useState<(number | null)[]>([...EMPTY_SCORES])
  const [advantage, setAdvantage] = useState('')
  const [disadvantage, setDisadvantage] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [recordId, setRecordId] = useState<number | null>(null)
  const [standards, setStandards] = useState<string[]>(Array(12).fill(''))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [highlightScores, setHighlightScores] = useState<boolean[]>(Array(12).fill(false))
  const [highlightAdvantage, setHighlightAdvantage] = useState(false)
  const [highlightDisadvantage, setHighlightDisadvantage] = useState(false)
  const [pendingEmployeeId, setPendingEmployeeId] = useState<number | null>(null)

  const readonly = status === '已提交'
  const canSubmit = status === '待确认' && !readonly

  const computed = useMemo(() => calculateScores(scores), [scores])

  const fetchStandards = useCallback(async (targetLevel: string) => {
    try {
      const data = await getStandard(targetLevel)
      setStandards(DIMENSION_FIELDS.map((f) => data[f]))
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载晋升标准失败')
      setStandards(Array(12).fill(''))
    }
  }, [])

  const loadDraft = useCallback(
    async (employeeId: number, reviewer: string) => {
      const name = reviewer.trim()
      if (!name) return

      setLoading(true)
      try {
        const data = await loadEvaluation(employeeId, name)
        setEmployee(data.employee)
        setEmployeeSearch(data.employee.name)
        applyRecord(data.record, {
          setScores,
          setAdvantage,
          setDisadvantage,
          setStatus,
          setRecordId,
        })
        await fetchStandards(data.employee.target_level)
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载评审数据失败')
      } finally {
        setLoading(false)
      }
    },
    [fetchStandards],
  )

  const handleReviewerBlur = () => {
    const name = reviewerName.trim()
    if (!name) return
    const id = employee?.id ?? pendingEmployeeId
    if (id) {
      loadDraft(id, name)
      setPendingEmployeeId(null)
    }
  }

  const handleEmployeeSearch = async (text: string) => {
    setEmployeeSearch(text)
    if (!text.trim()) {
      setSearchOptions([])
      return
    }
    try {
      const results = await searchEmployees(text.trim())
      setSearchOptions(
        results.map((r) => ({
          value: r.name,
          label: `${r.name}（${r.employee_no}）`,
          id: r.id,
        })),
      )
    } catch {
      setSearchOptions([])
    }
  }

  const handleEmployeeSelect = (_value: string, option: { id?: number }) => {
    if (!option.id) return
    if (reviewerName.trim()) {
      setPendingEmployeeId(null)
      loadDraft(option.id, reviewerName)
    } else {
      setPendingEmployeeId(option.id)
      message.warning('请先填写评委姓名')
    }
  }

  const validateReviewerAndEmployee = (): boolean => {
    if (!reviewerName.trim()) {
      message.error('请填写评委姓名')
      return false
    }
    if (!employee) {
      message.error('请选择员工')
      return false
    }
    return true
  }

  const handleClear = () => {
    Modal.confirm({
      title: '清空重写',
      content: '确定清空当前填写内容吗？评委姓名将保留。',
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        setEmployee(null)
        setEmployeeSearch('')
        setPendingEmployeeId(null)
        setScores([...EMPTY_SCORES])
        setAdvantage('')
        setDisadvantage('')
        setStatus(null)
        setRecordId(null)
        setStandards(Array(12).fill(''))
        setHighlightScores(Array(12).fill(false))
        setHighlightAdvantage(false)
        setHighlightDisadvantage(false)
      },
    })
  }

  const handleSaveDraft = async () => {
    if (!validateReviewerAndEmployee() || !employee) return

    setSaving(true)
    try {
      const record = await saveDraft({
        employee_id: employee.id,
        reviewer_name: reviewerName.trim(),
        scores,
        advantage: advantage || null,
        disadvantage: disadvantage || null,
      })
      setStatus(record.status)
      setRecordId(record.id)
      message.success('暂存成功')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '暂存失败')
    } finally {
      setSaving(false)
    }
  }

  const validateForGenerate = (): boolean => {
    const scoreErrors = scores.map((s) => s === null)
    const advError = !advantage.trim()
    const disError = !disadvantage.trim()

    setHighlightScores(scoreErrors)
    setHighlightAdvantage(advError)
    setHighlightDisadvantage(disError)

    if (scoreErrors.some(Boolean) || advError || disError) {
      message.error('请填写全部12项分数及突出优势、待发展项')
      return false
    }
    return true
  }

  const doGenerate = async (sys: string, result: string) => {
    if (!employee) return

    setSaving(true)
    try {
      const record = await generateResult({
        employee_id: employee.id,
        reviewer_name: reviewerName.trim(),
        scores: scores as number[],
        advantage: advantage.trim(),
        disadvantage: disadvantage.trim(),
        sys_suggestion: sys,
        reviewer_result: result,
      })
      setStatus(record.status)
      setRecordId(record.id)
      setScores([...record.scores])
      message.success('结果已生成，请确认后提交')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '生成结果失败')
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = () => {
    if (!validateReviewerAndEmployee()) return
    if (!validateForGenerate()) return

    const { finalScore } = calculateScores(scores)
    if (finalScore === null) return

    const { sys, result } = suggestResult(finalScore)

    if (finalScore <= 2) {
      Modal.confirm({
        title: '生成结果',
        content: '系统建议不予通过，是否确认？',
        okText: '确认',
        cancelText: '取消',
        onOk: () => doGenerate(sys, result!),
      })
    } else if (finalScore >= 4) {
      Modal.confirm({
        title: '生成结果',
        content: '系统建议晋升通过，是否确认？',
        okText: '确认',
        cancelText: '取消',
        onOk: () => doGenerate(sys, result!),
      })
    } else {
      Modal.confirm({
        title: '生成结果',
        content: '总分未达绝对标准，请评委自行选择',
        okText: '同意晋升',
        cancelText: '不同意晋升',
        closable: false,
        maskClosable: false,
        okButtonProps: { type: 'primary' },
        onOk: () => doGenerate(sys, '通过晋升'),
        onCancel: () => doGenerate(sys, '不通过晋升'),
      })
    }
  }

  const handleSubmit = () => {
    if (!canSubmit || !recordId) {
      message.warning('请先生成结果')
      return
    }

    Modal.confirm({
      title: '提交评审',
      content: '提交后数据将锁定不可修改，确定提交本次评审吗？',
      okText: '确定提交',
      cancelText: '取消',
      onOk: async () => {
        setSaving(true)
        try {
          const record = await submitEvaluation(recordId)
          setStatus(record.status)
          message.success('提交成功')
        } catch (err) {
          message.error(err instanceof Error ? err.message : '提交失败')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  useEffect(() => {
    if (highlightScores.some(Boolean)) {
      const cleared = scores.map((s, i) => (s !== null ? false : highlightScores[i]))
      if (cleared.some((v, i) => v !== highlightScores[i])) {
        setHighlightScores(cleared)
      }
    }
  }, [scores, highlightScores])

  useEffect(() => {
    if (highlightAdvantage && advantage.trim()) setHighlightAdvantage(false)
  }, [advantage, highlightAdvantage])

  useEffect(() => {
    if (highlightDisadvantage && disadvantage.trim()) setHighlightDisadvantage(false)
  }, [disadvantage, highlightDisadvantage])

  return (
    <div style={{ padding: 24, textAlign: 'left' }}>
      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        晋升评审
      </Title>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card size="small">
          <Space wrap size="large" style={{ width: '100%' }}>
            <div>
              <Text>
                评委姓名 <Text type="danger">*</Text>
              </Text>
              <Input
                style={{ width: 200, display: 'block', marginTop: 4 }}
                placeholder="请输入评委姓名"
                value={reviewerName}
                disabled={readonly}
                onChange={(e) => setReviewerName(e.target.value)}
                onBlur={handleReviewerBlur}
              />
            </div>
            <div>
              <Text>
                员工姓名 <Text type="danger">*</Text>
              </Text>
              <AutoComplete
                style={{ width: 240, display: 'block', marginTop: 4 }}
                placeholder="搜索并选择员工"
                value={employeeSearch}
                disabled={readonly}
                options={searchOptions}
                onSearch={handleEmployeeSearch}
                onSelect={handleEmployeeSelect}
                onChange={setEmployeeSearch}
              />
            </div>
          </Space>
        </Card>

        {employee && (
          <Card size="small" title="员工信息" loading={loading}>
            <Descriptions column={2} size="small" title="组织信息">
              <Descriptions.Item label="分管中心">
                {employee.division_center ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="一级部门">{employee.department ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="工号">{employee.employee_no}</Descriptions.Item>
              <Descriptions.Item label="岗位">{employee.position ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="学历">{employee.education ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="入职时间">
                {employee.join_date ? dayjs(employee.join_date).format('YYYY-MM-DD') : '-'}
              </Descriptions.Item>
            </Descriptions>
            <Descriptions column={2} size="small" title="晋升信息" style={{ marginTop: 16 }}>
              <Descriptions.Item label="晋升路径">
                {employee.current_level} → {employee.target_level}
              </Descriptions.Item>
              <Descriptions.Item label="提名情况">
                {employee.nomination_status ?? '-'}
              </Descriptions.Item>
            </Descriptions>
            {(employee.perf_fy24 || employee.perf_fy25 || employee.perf_fy25h1) && (
              <Descriptions column={3} size="small" title="绩效" style={{ marginTop: 16 }}>
                {employee.perf_fy24 && (
                  <Descriptions.Item label="FY24">{employee.perf_fy24}</Descriptions.Item>
                )}
                {employee.perf_fy25 && (
                  <Descriptions.Item label="FY25">{employee.perf_fy25}</Descriptions.Item>
                )}
                {employee.perf_fy25h1 && (
                  <Descriptions.Item label="FY25H1">{employee.perf_fy25h1}</Descriptions.Item>
                )}
              </Descriptions>
            )}
            {employee.nomination_reason && (
              <Collapse
                style={{ marginTop: 16 }}
                items={[
                  {
                    key: 'reason',
                    label: '提名理由',
                    children: (
                      <Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                        {employee.nomination_reason}
                      </Paragraph>
                    ),
                  },
                ]}
              />
            )}
            {employee.remark && (
              <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
                <Descriptions.Item label="备注">{employee.remark}</Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        )}

        {employee && (
          <>
            <ScoreMatrix
              scores={scores}
              onChange={setScores}
              standards={standards}
              disabled={readonly}
              highlightScores={highlightScores}
            />

            <Card size="small" title="实时计分">
              <Space size="large" wrap>
                <Text>
                  价值观平均分：
                  <Text strong>{computed.avgValues ?? '—'}</Text>
                </Text>
                <Text>
                  能力模型平均分：
                  <Text strong>{computed.avgCapability ?? '—'}</Text>
                </Text>
                <Text>
                  工作成果平均分：
                  <Text strong>{computed.avgOutput ?? '—'}</Text>
                </Text>
                <Text>
                  最终总分：
                  <Text strong type={computed.finalScore != null ? 'success' : undefined}>
                    {computed.finalScore ?? '—'}
                  </Text>
                </Text>
              </Space>
            </Card>

            <Card size="small" title="评语">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Text>
                    突出优势 <Text type="danger">*</Text>
                  </Text>
                  <Input.TextArea
                    rows={3}
                    style={{ marginTop: 4 }}
                    placeholder="请填写突出优势"
                    value={advantage}
                    disabled={readonly}
                    status={highlightAdvantage ? 'error' : undefined}
                    onChange={(e) => setAdvantage(e.target.value)}
                  />
                </div>
                <div>
                  <Text>
                    待发展项 <Text type="danger">*</Text>
                  </Text>
                  <Input.TextArea
                    rows={3}
                    style={{ marginTop: 4 }}
                    placeholder="请填写待发展项"
                    value={disadvantage}
                    disabled={readonly}
                    status={highlightDisadvantage ? 'error' : undefined}
                    onChange={(e) => setDisadvantage(e.target.value)}
                  />
                </div>
              </Space>
            </Card>

            {status && (
              <Text type="secondary">
                当前状态：{status}
                {status === '已提交' && '（已锁定，不可修改）'}
              </Text>
            )}

            <Space wrap>
              <Button onClick={handleClear} disabled={readonly || saving}>
                清空重写
              </Button>
              <Button onClick={handleSaveDraft} loading={saving} disabled={readonly}>
                暂存
              </Button>
              <Button type="primary" onClick={handleGenerate} loading={saving} disabled={readonly}>
                生成结果
              </Button>
              <Button
                type="primary"
                danger
                onClick={handleSubmit}
                loading={saving}
                disabled={!canSubmit}
              >
                提交
              </Button>
            </Space>
          </>
        )}
      </Space>
    </div>
  )
}
