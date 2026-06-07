import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Form, Input, Modal, Tabs, message } from 'antd'
import { LEVELS } from '../../api/employees'
import {
  DIMENSION_FIELDS,
  DIMENSION_LABELS,
  getStandard,
  updateStandard,
  type DimensionField,
  type StandardUpdate,
} from '../../api/standards'

const LEVEL_TABS = LEVELS.map((l) => ({ key: l, label: l }))

function emptyStandard(): StandardUpdate {
  return Object.fromEntries(DIMENSION_FIELDS.map((f) => [f, ''])) as StandardUpdate
}

export default function Standards() {
  const [activeLevel, setActiveLevel] = useState<string>('P5')
  const [form] = Form.useForm<StandardUpdate>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const savedSnapshot = useRef<string>('')

  const loadStandard = useCallback(
    async (level: string) => {
      setLoading(true)
      try {
        const data = await getStandard(level)
        const values: StandardUpdate = Object.fromEntries(
          DIMENSION_FIELDS.map((f) => [f, data[f]]),
        ) as StandardUpdate
        form.setFieldsValue(values)
        savedSnapshot.current = JSON.stringify(values)
        setDirty(false)
      } catch (err) {
        message.error(err instanceof Error ? err.message : '加载失败')
      } finally {
        setLoading(false)
      }
    },
    [form],
  )

  useEffect(() => {
    loadStandard(activeLevel)
  }, [activeLevel, loadStandard])

  const handleTabChange = (key: string) => {
    if (key === activeLevel) return

    const proceed = () => {
      setActiveLevel(key)
    }

    if (dirty) {
      Modal.confirm({
        title: '未保存的修改',
        content: '当前页面有未保存的修改，切换将丢失内容，是否继续？',
        okText: '继续',
        cancelText: '取消',
        onOk: proceed,
      })
    } else {
      proceed()
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      await updateStandard(activeLevel, values)
      savedSnapshot.current = JSON.stringify(values)
      setDirty(false)
      message.success('保存成功')
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleValuesChange = () => {
    const current = JSON.stringify(form.getFieldsValue())
    setDirty(current !== savedSnapshot.current)
  }

  return (
    <div style={{ position: 'relative', paddingBottom: 72 }}>
      <Tabs activeKey={activeLevel} items={LEVEL_TABS} onChange={handleTabChange} />

      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        disabled={loading}
        initialValues={emptyStandard()}
      >
        {DIMENSION_FIELDS.map((field, index) => (
          <Form.Item key={field} name={field as DimensionField} label={DIMENSION_LABELS[index]}>
            <Input.TextArea rows={4} placeholder={`请输入${DIMENSION_LABELS[index]}标准描述`} />
          </Form.Item>
        ))}
      </Form>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 200,
          right: 0,
          padding: '12px 24px',
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          textAlign: 'right',
          zIndex: 10,
        }}
      >
        <Button type="primary" loading={saving} onClick={handleSave} disabled={loading}>
          保存配置
        </Button>
      </div>
    </div>
  )
}
