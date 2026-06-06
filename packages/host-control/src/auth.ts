export interface AuthenticatedHostUser {
  email: string
  roles: string[]
  subject: string
}

export interface AuthProvider {
  authenticateRequest: (input: { headers: Headers }) => Promise<AuthenticatedHostUser | null>
}

export function userIsHostAdmin(user: AuthenticatedHostUser): boolean {
  return user.roles.includes('host:admin')
}

export function createStaticAuthProvider(user: AuthenticatedHostUser | null): AuthProvider {
  return {
    async authenticateRequest() {
      return user
    },
  }
}
