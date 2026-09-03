/**
 * Session cookie name. Kept in its own dependency-free module so the Edge
 * middleware can import it without pulling in Prisma / node APIs.
 */
export const SESSION_COOKIE = "qc_session";
