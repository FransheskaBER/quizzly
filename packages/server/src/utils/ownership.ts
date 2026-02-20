import { ForbiddenError } from './errors.js';

/**
 * Asserts that the authenticated user owns the resource.
 * Throws ForbiddenError if the resource belongs to a different user.
 */
export function assertOwnership(resourceUserId: string, authenticatedUserId: string): void {
  if (resourceUserId !== authenticatedUserId) {
    throw new ForbiddenError('You do not have permission to access this resource');
  }
}
