import { getToken, setToken, clearToken } from '../api/client'
import client from '../api/client'

export function useAuth() {
  const isLoggedIn = !!getToken()

  const login = async (username: string, password: string) => {
    const res = await client.post('/auth/login', { username, password })
    setToken(res.data.access_token)
  }

  const logout = () => {
    clearToken()
    window.location.href = '/admin/login'
  }

  return { isLoggedIn, login, logout }
}
