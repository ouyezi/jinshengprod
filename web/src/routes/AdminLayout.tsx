import { useState } from 'react'
import { Layout, Menu, Button, Form, Input, Modal, message } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { TeamOutlined, FileTextOutlined, BarChartOutlined, LogoutOutlined } from '@ant-design/icons'
import { changePassword } from '../api/auth'
import { useAuth } from '../hooks/useAuth'

const { Header, Sider, Content } = Layout

const menuItems = [
  { key: '/admin/employees', icon: <TeamOutlined />, label: '员工管理' },
  { key: '/admin/standards', icon: <FileTextOutlined />, label: '晋升标准' },
  { key: '/admin/summary', icon: <BarChartOutlined />, label: '评审汇总' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdForm] = Form.useForm()

  const handleChangePassword = async () => {
    const values = await pwdForm.validateFields()
    if (values.new_password !== values.confirm_password) {
      message.error('两次输入的新密码不一致')
      return
    }
    setPwdLoading(true)
    try {
      await changePassword(values.old_password, values.new_password)
      message.success('密码已修改，请重新登录')
      setPwdOpen(false)
      pwdForm.resetFields()
      logout()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '修改失败')
    } finally {
      setPwdLoading(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200}>
        <div style={{ height: 32, margin: 16, color: '#fff', fontSize: 16, fontWeight: 600 }}>
          晋升评审系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
        <div style={{ padding: 16, position: 'absolute', bottom: 0, width: '100%' }}>
          <Button type="text" block style={{ color: '#fff', marginBottom: 8 }} onClick={() => setPwdOpen(true)}>
            修改密码
          </Button>
          <Button type="text" icon={<LogoutOutlined />} onClick={logout} style={{ color: '#fff' }} block>
            退出登录
          </Button>
        </div>
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', fontSize: 18, fontWeight: 500 }}>
          管理后台
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
      <Modal
        title="修改密码"
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        onOk={handleChangePassword}
        confirmLoading={pwdLoading}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="old_password" label="旧密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirm_password" label="确认新密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
