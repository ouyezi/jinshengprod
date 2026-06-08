import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
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
  submitEvaluation,
  type DraftPayload,
  type EvaluationRecord,
} from '../../api/evaluations'
import type { Employee } from '../../api/employees'
import ScoreMatrix from '../../components/ScoreMatrix'
import { type SaveStatus, useAutoSaveDraft } from '../../hooks/useAutoSaveDraft'
import { calculateScores, suggestResult } from '../../utils/scoring'

const { Title, Text, Paragraph } = Typography

const REVIEWER_NAME_KEY = 'review_reviewer_name'
const EMPLOYEE_ID_KEY = 'review_employee_id'
const DRAFT_STATUS = '待生成结果'
const READY_SUBMIT_STATUS = '待提交'

function readStoredReviewerName(): string {
  try {
    return localStorage.getItem(REVIEWER_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function readStoredEmployeeId(): number | null {
  try {
    const raw = localStorage.getItem(EMPLOYEE_ID_KEY)
    if (!raw) return null
    const id = parseInt(raw, 10)
    return Number.isNaN(id) ? null : id
  } catch {
    return null
  }
}

function persistReviewerName(name: string) {
  try {
    const trimmed = name.trim()
    if (trimmed) localStorage.setItem(REVIEWER_NAME_KEY, trimmed)
    else localStorage.removeItem(REVIEWER_NAME_KEY)
  } catch {
    // localStorage unavailable
  }
}

function persistEmployeeId(employeeId: number | null) {
  try {
    if (employeeId) localStorage.setItem(EMPLOYEE_ID_KEY, String(employeeId))
    else localStorage.removeItem(EMPLOYEE_ID_KEY)
  } catch {
    // localStorage unavailable
  }
}

const EMPTY_SCORES: (number | null)[] = Array(12).fill(null)

function applyRecord(
  record: EvaluationRecord | null,
  setters: {
    setScores: (s: (number | null)[]) => void
    setAdvantage: (v: string) => void
    setDisadvantage: (v: string) => void
    setStatus: (s: string | null) => void
    setRecordId: (id: number | null) => void
    setReviewerResult: (v: string | null) => void
  },
) {
  if (record) {
    setters.setScores([...record.scores])
    setters.setAdvantage(record.advantage ?? '')
    setters.setDisadvantage(record.disadvantage ?? '')
    setters.setStatus(record.status)
    setters.setRecordId(record.id)
    setters.setReviewerResult(record.reviewer_result ?? null)
  } else {
    setters.setScores([...EMPTY_SCORES])
    setters.setAdvantage('')
    setters.setDisadvantage('')
    setters.setStatus(DRAFT_STATUS)
    setters.setRecordId(null)
    setters.setReviewerResult(null)
  }
}

export default function Evaluation() {
  const [reviewerName, setReviewerName] = useState(readStoredReviewerName)
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
  const [reviewerResult, setReviewerResult] = useState<string | null>(null)
  const [standards, setStandards] = useState<string[]>(Array(12).fill(''))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [highlightScores, setHighlightScores] = useState<boolean[]>(Array(12).fill(false))
  const [highlightAdvantage, setHighlightAdvantage] = useState(false)
  const [highlightDisadvantage, setHighlightDisadvantage] = useState(false)
  const [pendingEmployeeId, setPendingEmployeeId] = useState<number | null>(null)
  const [showSubmittedHint, setShowSubmittedHint] = useState(false)
  const restoredRef = useRef(false)

  const readonly = status === '已提交'
  const canSubmit = status === READY_SUBMIT_STATUS && reviewerResult != null && !readonly
  const needsRegenerate = status === READY_SUBMIT_STATUS && reviewerResult == null && !readonly

  const computed = useMemo(() => calculateScores(scores), [scores])
  const draftPayload = useMemo<DraftPayload | null>(() => {
    if (!employee || !reviewerName.trim() || readonly) return null
    return {
      employee_id: employee.id,
      reviewer_name: reviewerName.trim(),
      scores,
      advantage: advantage || null,
      disadvantage: disadvantage || null,
    }
  }, [employee, reviewerName, scores, advantage, disadvantage, readonly])

  const saveStatusText = useMemo(() => {
    if (saveStatus === 'saving') return '自动保存中...'
    if (saveStatus === 'saved') return '已自动保存'
    return ''
  }, [saveStatus])

  const onDraftSaved = useCallback((record: EvaluationRecord) => {
    setStatus(record.status)
    setRecordId(record.id)
    setReviewerResult(record.reviewer_result ?? null)
  }, [])

  const { flush } = useAutoSaveDraft({
    enabled: !readonly && !!draftPayload,
    payload: draftPayload,
    onSaved: onDraftSaved,
    setSaveStatus,
  })

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
          setReviewerResult,
        })
        setShowSubmittedHint(data.has_submitted && !data.record)
        persistReviewerName(name)
        persistEmployeeId(data.employee.id)
        await fetchStandards(data.employee.target_level)
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载评审数据失败')
      } finally {
        setLoading(false)
      }
    },
    [fetchStandards],
  )

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const name = readStoredReviewerName()
    const employeeId = readStoredEmployeeId()
    if (name && employeeId) {
      loadDraft(employeeId, name)
    }
  }, [loadDraft])

  const handleReviewerBlur = async () => {
    const name = reviewerName.trim()
    persistReviewerName(name)
    if (!name) return
    const id = employee?.id ?? pendingEmployeeId
    if (id) {
      await flush()
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

  const handleEmployeeSelect = async (_value: string, option: { id?: number }) => {
    if (!option.id) return
    if (reviewerName.trim()) {
      setPendingEmployeeId(null)
      await flush()
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
        setShowSubmittedHint(false)
        setSaveStatus('idle')
        persistEmployeeId(null)
      },
    })
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
      setReviewerResult(record.reviewer_result ?? null)
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
    if (finalScore > 2 && finalScore < 4) {
      Modal.confirm({
        title: '生成评审结果',
        content: '总分未达绝对标准，请选择是否同意晋升。',
        okText: '同意晋升',
        cancelText: '不同意晋升',
        closable: false,
        maskClosable: false,
        okButtonProps: { type: 'primary' },
        onOk: () => {
          void doGenerate(sys, '通过晋升')
        },
        onCancel: () => {
          void doGenerate(sys, '不通过晋升')
        },
      })
      return
    }

    if (!result) {
      message.error('生成结果失败，请重试')
      return
    }
    void doGenerate(sys, result)
  }

  const submitFlow = async () => {
    if (!recordId) return
    setSaving(true)
    try {
      const record = await submitEvaluation(recordId)
      setStatus(record.status)
      setReviewerResult(record.reviewer_result ?? reviewerResult ?? null)
      message.success('提交成功')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = () => {
    if (!canSubmit || !recordId) {
      message.warning(needsRegenerate ? '请先重新生成评审结果' : '请先生成结果')
      return
    }

    Modal.confirm({
      title: '提交评审',
      content: `晋升结果为「${reviewerResult ?? '-'}」，提交后不可修改，确定提交本次评审吗？`,
      okText: '确定提交',
      cancelText: '取消',
      onOk: () => {
        void submitFlow()
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
                placeholder="搜索姓名、工号或拼音"
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
            {showSubmittedHint && (
              <Alert
                type="info"
                showIcon
                message="您已提交过该员工的评审，如需修改请重新填写并提交，线下告知管理员保留哪一条。"
              />
            )}

            <ScoreMatrix
              scores={scores}
              onChange={setScores}
              standards={standards}
              disabled={readonly}
              highlightScores={highlightScores}
            />

            <Card
              size="small"
              title={
                <Space>
                  <span>实时计分</span>
                  {saveStatusText && <Text type="secondary">{saveStatusText}</Text>}
                </Space>
              }
            >
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
                <Text>
                  晋升结果：
                  <Text
                    strong
                    type={
                      reviewerResult === '通过晋升'
                        ? 'success'
                        : reviewerResult === '不通过晋升'
                          ? 'danger'
                          : undefined
                    }
                  >
                    {reviewerResult ?? '—'}
                  </Text>
                </Text>
              </Space>
              {needsRegenerate && (
                <div style={{ marginTop: 8 }}>
                  <Text type="danger">当前结果缺失，请点击“生成结果”重新生成后再提交。</Text>
                </div>
              )}
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

            {employee && (
              <div>
                {status && (
                  <Text type="secondary">
                    当前状态：{status}
                    {status === '已提交' && '（已锁定，不可修改）'}
                  </Text>
                )}
                <br />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  生成结果规则：总分 ≤ 2 直接「不通过晋升」；总分 ≥ 4 直接「通过晋升」；2 &lt; 总分
                  &lt; 4 时评委需自行选择是否同意晋升。
                </Text>
              </div>
            )}

            <Space wrap>
              <Button onClick={handleClear} disabled={readonly || saving}>
                清空重写
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
