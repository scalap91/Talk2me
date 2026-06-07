/**
 * Talk2Me #406+#407 — Auth helper pour AI Ops admin routes.
 *
 * Extension de FUZZ_ADMIN_EMAILS (#405) avec AI_OPS_ADMIN_EMAILS.
 * Pascal verbatim : "extender à AI_OPS_ADMIN_EMAILS".
 */

export function isAiOpsAdmin(
  userId: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (userId) {
    const ids = (process.env.AI_OPS_ADMIN_USER_IDS || process.env.FUZZ_ADMIN_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.includes(userId)) return true;
  }
  if (email) {
    const emails = (
      process.env.AI_OPS_ADMIN_EMAILS ||
      process.env.FUZZ_ADMIN_EMAILS ||
      'pascal.repir@gmail.com'
    )
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (emails.includes(email.toLowerCase())) return true;
  }
  return false;
}

/**
 * Vérifie le token daemon (header x-ai-ops-daemon-token).
 * Le daemon est trusted dès qu'il a le token (qui est un secret partagé).
 */
export function isDaemonRequest(headerToken: string | null | undefined): boolean {
  const expected = process.env.AI_OPS_DAEMON_TOKEN;
  if (!expected) return false;
  if (!headerToken) return false;
  // Comparaison constante-time minimale
  if (headerToken.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < headerToken.length; i++) {
    diff |= headerToken.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
