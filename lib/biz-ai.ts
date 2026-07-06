'use server-only';

/**
 * Talk2Me — Réponse IA d'une messagerie ENTREPRISE (Module 2, Pascal 2026-06-09).
 * Quand la réponse auto est activée, l'assistant répond au visiteur, ANCRÉ sur la
 * base documentaire fournie par le propriétaire (doctrine grounding : on n'invente
 * rien — pas de prix, pas de promesse hors doc ; si la réponse n'y est pas, on dit
 * qu'un humain reprend la suite). Le message est posté comme `ai_reply` → visible
 * dans le widget (poll) ET dans la messagerie T2M du propriétaire.
 */

import OpenAI from 'openai';
import { recordLlmUsage } from '@/lib/schema/llm-usage';
import { appendMessage } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
import { getMessagesAfter, type BusinessInbox } from '@/lib/biz-inbox';

export async function runBizAiReply(inbox: BusinessInbox, convId: string, guestUserId: string): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return;

  // Historique récent (max ~20 derniers messages) mappé visiteur/assistant.
  const history = getMessagesAfter(convId, 0).slice(-20);
  if (history.length === 0) return;

  const sys =
    `Tu es l'assistant de "${inbox.name}". Tu réponds à un CLIENT sur le chat du site, en FRANÇAIS, ` +
    `de façon brève, claire et polie (2-4 phrases max). ` +
    `RÈGLE ABSOLUE : tu réponds UNIQUEMENT à partir de la base documentaire ci-dessous + politesse générale. ` +
    `Tu n'INVENTES JAMAIS de prix, de délai, de chiffre ou d'engagement qui ne sont pas écrits dans la base. ` +
    `Si la question n'est pas couverte par la base, dis simplement qu'un conseiller va revenir vers le client très vite, ` +
    `et invite-le à préciser son besoin. Ne dis jamais que tu es une IA générique ni que tu n'as pas l'information « en interne ».\n\n` +
    `=== BASE DOCUMENTAIRE ${inbox.name} ===\n` +
    (inbox.knowledge && inbox.knowledge.trim() ? inbox.knowledge.trim() : '(vide pour le moment)') +
    `\n=== FIN BASE ===`;

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [{ role: 'system', content: sys }];
  for (const m of history) {
    if (!m.text) continue;
    messages.push({ role: m.sender_id === guestUserId ? 'user' : 'assistant', content: m.text });
  }

  let reply = '';
  try {
    const openai = new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 30000, maxRetries: 1 });
    const completion = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages,
      temperature: 0.4,
      max_tokens: 350,
    });
    recordLlmUsage(process.env.DEEPSEEK_MODEL || 'deepseek-chat', completion.usage, 'biz-ai');
    reply = (completion.choices[0]?.message?.content || '').trim();
  } catch {
    return; // silence : un humain prendra le relais
  }
  if (!reply) return;

  const msg = appendMessage(
    convId, 'agent', reply, [],
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    { kind: 'ai_reply', aiForUserId: inbox.owner_id, aiName: `${inbox.name} (IA)` }
  );

  publish(`conv:${convId}`, {
    kind: 'chat',
    data: {
      id: msg.id,
      conversation_id: convId,
      sender_id: inbox.owner_id,
      text: msg.text,
      created_at: msg.created_at,
      kind: 'ai_reply',
      ai_name: `${inbox.name} (IA)`,
      media: null,
    },
  });
}
