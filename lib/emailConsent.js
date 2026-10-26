import { supabase } from './supabase';

export async function saveEmailConsent({ clerkId, email, promoEmails }) {
  if (!supabase || !clerkId || !email) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from('email_consents').upsert(
    {
      clerk_id: clerkId,
      email: email.trim().toLowerCase(),
      promo_emails: Boolean(promoEmails),
      decided_at: now,
      updated_at: now,
    },
    { onConflict: 'clerk_id' }
  );

  if (error) {
    throw new Error(error.message || 'Impossible d’enregistrer le choix e-mail.');
  }
}
