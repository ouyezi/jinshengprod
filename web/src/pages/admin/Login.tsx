import { Button, Card, Form, Input, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      await login(values.username, values.password)
      message.success('登录成功')
      navigate('/admin/employees')
    } catch {
      message.error('用户名或密码错误')
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Card title="管理员登录" style={{ width: 400 }}>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="username" label="账号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
