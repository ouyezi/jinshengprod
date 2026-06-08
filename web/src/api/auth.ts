import client from './client'

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await client.post('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
}
