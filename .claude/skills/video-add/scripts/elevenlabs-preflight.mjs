import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../voice-config.json', import.meta.url), 'utf8'));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.log(JSON.stringify({ status: 'CONNECTION_MISSING', reason: 'Set ELEVENLABS_API_KEY locally in a secure environment. Never send it in chat or email.', voice_provider: config.voice_provider, voice_verified: config.voice_verified }));
  process.exitCode = 2;
} else {
  try {
    const get = async path => {
      const response = await fetch('https://api.elevenlabs.io' + path, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('ElevenLabs read failed: HTTP ' + response.status);
      return response.json();
    };
    const subscription = await get('/v1/user/subscription');
    const voices = await get('/v1/voices');
    const models = await get('/v1/models');
    const selected = voices.voices?.find(v => v.voice_id === config.default_voice_id);
    const model = models.find(m => m.model_id === config.model_id);
    const supportsHebrew = model?.languages?.some(l => l.language_id === 'he') === true;
    console.log(JSON.stringify({
      status: config.voice_verified && selected && supportsHebrew ? 'REVIEW_QUOTA_BEFORE_SYNTHESIS' : 'VOICE_OR_MODEL_VERIFICATION_REQUIRED',
      subscription: { tier: subscription.tier, status: subscription.status, character_count: subscription.character_count, character_limit: subscription.character_limit, remaining: Math.max(0, subscription.character_limit - subscription.character_count), max_credit_limit_extension: subscription.max_credit_limit_extension, next_reset_unix: subscription.next_character_count_reset_unix },
      model: { id: config.model_id, supportsHebrew },
      default_voice_id: config.default_voice_id,
      voices: (voices.voices ?? []).map(v => ({ voice_id: v.voice_id, name: v.name, category: v.category, is_owner: v.is_owner })),
      synthesis_performed: false
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'CONNECTION_FAILED', reason: String(error.message).replaceAll(key, '[redacted]'), synthesis_performed: false }));
    process.exitCode = 1;
  }
}
