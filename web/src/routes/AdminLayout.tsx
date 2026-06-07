import { Layout, Menu, Button } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { TeamOutlined, FileTextOutlined, BarChartOutlined, LogoutOutlined } from '@ant-design/icons'
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
    </Layout>
  )
}
