import axios from 'axios'

const TOKEN_KEY = 'admin_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

const client = axios.create({ baseURL: '/api' })

client.interceptors.request.use((config) => {
  const token = getToken()
  if (
    token &&
    config.url &&
    !config.url.includes('/evaluations/load') &&
    !config.url.includes('/evaluations/draft') &&
    !config.url.includes('/evaluations/generate') &&
    !config.url.includes('/evaluations/submit') &&
    !config.url.includes('/employees/search')
  ) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => {
    if (res.data?.code !== 0) {
      return Promise.reject(new Error(res.data?.message || '请求失败'))
    }
    return res.data
  },
  (err) => {
    if (err.response?.status === 403) {
      clearToken()
      window.location.href = '/admin/login'
    }
    return Promise.reject(err)
  },
)

export default client
