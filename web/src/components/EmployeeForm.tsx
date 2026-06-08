import { DatePicker, Form, Input, Modal, Select, Typography } from 'antd'
import { useEffect } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { LEVELS, nextTargetLevel, type Employee, type EmployeePayload } from '../api/employees'

const { TextArea } = Input

interface FormValues extends Omit<EmployeePayload, 'join_date'> {
  join_date?: Dayjs
}

interface EmployeeFormProps {
  open: boolean
  employee: Employee | null
  onCancel: () => void
  onSubmit: (values: EmployeePayload) => Promise<void>
}

function toNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

export default function EmployeeForm({ open, employee, onCancel, onSubmit }: EmployeeFormProps) {
  const [form] = Form.useForm<FormValues>()
  const isEdit = !!employee
  const currentLevel = Form.useWatch('current_level', form)

  useEffect(() => {
    if (open) {
      if (employee) {
        form.setFieldsValue({
          employee_no: employee.employee_no,
          name: employee.name,
          division_center: employee.division_center ?? undefined,
          department: employee.department ?? undefined,
          education: employee.education ?? undefined,
          position: employee.position ?? undefined,
          current_level: employee.current_level,
          target_level: employee.target_level,
          perf_fy24: employee.perf_fy24 ?? undefined,
          perf_fy25: employee.perf_fy25 ?? undefined,
          perf_fy25h1: employee.perf_fy25h1 ?? undefined,
          join_date: employee.join_date ? dayjs(employee.join_date) : undefined,
          remark: employee.remark ?? undefined,
          nomination_status: employee.nomination_status ?? undefined,
          nomination_reason: employee.nomination_reason ?? undefined,
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, employee, form])

  const handleCurrentLevelChange = (level: string) => {
    const next = nextTargetLevel(level)
    form.setFieldValue('target_level', next ?? undefined)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    await onSubmit({
      employee_no: values.employee_no.trim(),
      name: values.name.trim(),
      division_center: toNull(values.division_center),
      department: toNull(values.department),
      education: toNull(values.education),
      position: toNull(values.position),
      current_level: values.current_level,
      target_level: values.target_level,
      perf_fy24: toNull(values.perf_fy24),
      perf_fy25: toNull(values.perf_fy25),
      perf_fy25h1: toNull(values.perf_fy25h1),
      join_date: values.join_date ? values.join_date.format('YYYY-MM-DD') : null,
      remark: toNull(values.remark),
      nomination_status: toNull(values.nomination_status),
      nomination_reason: toNull(values.nomination_reason),
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
      width={720}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          基本信息
        </Typography.Title>
        <Form.Item
          name="employee_no"
          label="工号"
          rules={[{ required: true, message: '请输入工号' }]}
        >
          <Input placeholder="请输入工号" />
        </Form.Item>
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
          <Input placeholder="请输入姓名" />
        </Form.Item>
        <Form.Item name="division_center" label="分管中心">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="department" label="一级部门">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="education" label="学历">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="position" label="岗位">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="join_date" label="入职时间">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Typography.Title level={5}>晋升信息</Typography.Title>
        <Form.Item
          name="current_level"
          label="当前职级"
          rules={[{ required: true, message: '请选择当前职级' }]}
        >
          <Select
            options={levelOptions}
            placeholder="请选择当前职级"
            onChange={handleCurrentLevelChange}
          />
        </Form.Item>
        <Form.Item
          name="target_level"
          label="目标职级"
          rules={[{ required: true, message: '请选择目标职级' }]}
          help={currentLevel === 'P10' ? 'P10 无法自动晋升' : undefined}
        >
          <Select options={levelOptions} placeholder="请选择目标职级" />
        </Form.Item>
        <Form.Item name="nomination_status" label="提名情况">
          <Input placeholder="选填，如：提名晋升" />
        </Form.Item>

        <Typography.Title level={5}>绩效</Typography.Title>
        <Form.Item name="perf_fy24" label="FY24年度等级">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="perf_fy25" label="FY25年度等级">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="perf_fy25h1" label="FY25H1等级">
          <Input placeholder="选填" />
        </Form.Item>

        <Typography.Title level={5}>其他</Typography.Title>
        <Form.Item name="remark" label="备注">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="nomination_reason" label="提名理由">
          <TextArea rows={4} placeholder="选填" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
