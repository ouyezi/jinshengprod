import { Form, Input, Modal, Select } from 'antd'
import { useEffect } from 'react'
import { LEVELS, type Employee, type EmployeePayload } from '../api/employees'

interface EmployeeFormProps {
  open: boolean
  employee: Employee | null
  onCancel: () => void
  onSubmit: (values: EmployeePayload) => Promise<void>
}

export default function EmployeeForm({ open, employee, onCancel, onSubmit }: EmployeeFormProps) {
  const [form] = Form.useForm<EmployeePayload>()
  const isEdit = !!employee

  useEffect(() => {
    if (open) {
      if (employee) {
        form.setFieldsValue({
          name: employee.name,
          current_level: employee.current_level,
          target_level: employee.target_level,
          performance_history: employee.performance_history ?? undefined,
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, employee, form])

  const handleOk = async () => {
    const values = await form.validateFields()
    await onSubmit({
      ...values,
      performance_history: values.performance_history?.trim() || null,
    })
  }

  const levelOptions = LEVELS.map((l) => ({ label: l, value: l }))

  return (
    <Modal
      title={isEdit ? '修改员工' : '新增员工'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      destroyOnClose
      okText="确定"
      cancelText="取消"
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
          <Input placeholder="请输入姓名" />
        </Form.Item>
        <Form.Item
          name="current_level"
          label="当前职级"
          rules={[{ required: true, message: '请选择当前职级' }]}
        >
          <Select options={levelOptions} placeholder="请选择当前职级" />
        </Form.Item>
        <Form.Item
          name="target_level"
          label="目标职级"
          rules={[{ required: true, message: '请选择目标职级' }]}
        >
          <Select options={levelOptions} placeholder="请选择目标职级" />
        </Form.Item>
        <Form.Item name="performance_history" label="近两年绩效">
          <Input placeholder="选填" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
