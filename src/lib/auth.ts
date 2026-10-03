import { AuthError, MissingIdentityError } from '@netlify/identity'

export function authErrorMessage(error: unknown): string {
  if (error instanceof MissingIdentityError) {
    return 'Account services are not available yet. Please try again shortly.'
  }
  if (error instanceof AuthError) {
    const message = error.message.toLowerCase()
    if (message.includes('confirm') || message.includes('verified')) {
      return 'Please confirm your email using the link in your inbox before signing in.'
    }
    if (message.includes('already') || message.includes('registered')) {
      return 'An account with this email already exists. Sign in or reset your password.'
    }
    if (error.status === 429 || message.includes('rate limit')) {
      return 'A few too many attempts. Please wait a moment and try again.'
    }
    if (error.status === 401 || error.status === 400) {
      return 'We couldn’t sign you in. Check your email and password and try again.'
    }
    if (error.status === 403) {
      return 'This action is not available for your account. Please try again later.'
    }
    if (error.status === 404 || (error.status !== undefined && error.status >= 500)) {
      return 'Account services are not available yet. Please try again shortly.'
    }
    if (error.status === 422) {
      return 'Please check your details. Your email must be valid and your password must meet the requirements.'
    }
  }
  return 'We couldn’t connect to account services. Please check your connection and try again.'
}
