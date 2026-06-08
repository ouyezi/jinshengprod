import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Modal, Space, Table, Tooltip, Upload, message } from 'antd'
import { DownloadOutlined, UploadOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import EmployeeForm from '../../components/EmployeeForm'
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  deleteAllEmployees,
  downloadTemplate,
  importEmployees,
  type Employee,
  type EmployeePayload,
} from '../../api/employees'

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [debouncedName, setDebouncedName] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(searchName), 300)
    return () => clearTimeout(timer)
  }, [searchName])

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listEmployees(debouncedName || undefined)
      setEmployees(data)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [debouncedName])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadTemplate()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'employee_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      message.error('下载模板失败')
    }
  }

  const handleImport = async (file: File) => {
    try {
      const result = await importEmployees(file)
      if (result.errors.length > 0) {
        message.warning(`导入完成：成功 ${result.success} 条，失败 ${result.errors.length} 条`)
      } else {
        message.success(`导入成功 ${result.success} 条`)
      }
      fetchEmployees()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导入失败')
    }
    return false
  }

  const handleClearAll = () => {
    Modal.confirm({
      title: '清空全部员工',
      content: '警告：清空后将导致所有进行中的评委打分无法匹配员工，确定要清空所有员工基础数据吗？',
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteAllEmployees()
        message.success('已清空全部员工')
        fetchEmployees()
      },
    })
  }

  const handleFormSubmit = async (values: EmployeePayload) => {
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, values)
        message.success('修改成功')
      } else {
        await createEmployee(values)
        message.success('新增成功')
      }
      setFormOpen(false)
      setEditingEmployee(null)
      fetchEmployees()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败')
      throw err
    }
  }

  const handleDelete = (record: Employee) => {
    Modal.confirm({
      title: '删除员工',
      content: `确定要删除员工「${record.name}」吗？`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteEmployee(record.id)
        message.success('删除成功')
        fetchEmployees()
      },
    })
  }

  const columns: ColumnsType<Employee> = [
    {
      title: '分管中心',
      dataIndex: 'division_center',
      key: 'division_center',
      width: 120,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '一级部门',
      dataIndex: 'department',
      key: 'department',
      width: 120,
      render: (v: string | null) => v ?? '-',
    },
    { title: '工号', dataIndex: 'employee_no', key: 'employee_no', width: 100 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    {
      title: '学历',
      dataIndex: 'education',
      key: 'education',
      width: 80,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '岗位',
      dataIndex: 'position',
      key: 'position',
      width: 140,
      render: (v: string | null) => v ?? '-',
    },
    { title: '职级', dataIndex: 'current_level', key: 'current_level', width: 70 },
    { title: '目标职级', dataIndex: 'target_level', key: 'target_level', width: 90 },
    {
      title: 'FY24年度等级',
      dataIndex: 'perf_fy24',
      key: 'perf_fy24',
      width: 110,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'FY25年度等级',
      dataIndex: 'perf_fy25',
      key: 'perf_fy25',
      width: 110,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: 'FY25H1等级',
      dataIndex: 'perf_fy25h1',
      key: 'perf_fy25h1',
      width: 110,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '入职时间',
      dataIndex: 'join_date',
      key: 'join_date',
      width: 110,
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '-'),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 120,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '提名情况',
      dataIndex: 'nomination_status',
      key: 'nomination_status',
      width: 100,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '提名理由',
      dataIndex: 'nomination_reason',
      key: 'nomination_reason',
      width: 200,
      ellipsis: { showTitle: false },
      render: (v: string | null) => (v ? <Tooltip title={v}>{v}</Tooltip> : '-'),
    },
    {
      title: '更新时间',
      dataIndex: 'update_time',
      key: 'update_time',
      width: 180,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setEditingEmployee(record)
              setFormOpen(true)
            }}
          >
            修改
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditingEmployee(null)
            setFormOpen(true)
          }}
        >
          添加员工
        </Button>
        <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
          下载模板
        </Button>
        <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleImport}>
          <Button icon={<UploadOutlined />}>导入员工</Button>
        </Upload>
        <Button icon={<DeleteOutlined />} danger onClick={handleClearAll}>
          清空全部
        </Button>
        <Input.Search
          placeholder="搜索姓名或工号"
          allowClear
          style={{ width: 240 }}
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={employees}
        loading={loading}
        scroll={{ x: 2400 }}
        pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
      />

      <EmployeeForm
        open={formOpen}
        employee={editingEmployee}
        onCancel={() => {
          setFormOpen(false)
          setEditingEmployee(null)
        }}
        onSubmit={handleFormSubmit}
      />
    </div>
  )
}
