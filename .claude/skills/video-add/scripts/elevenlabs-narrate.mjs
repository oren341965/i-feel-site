import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = name => argv[argv.indexOf(name) + 1];
const config = JSON.parse(readFileSync(new URL('../voice-config.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const fail = message => { throw new Error(message); };
let key;
try {
  if (!argv.includes('--text-file') || !argv.includes('--output')) fail('Usage: --text-file script.txt --output voice.mp3 [--dry-run]');
  key = process.env.ELEVENLABS_API_KEY;
  if (!key) fail('CONNECTION_MISSING: configure ELEVENLABS_API_KEY locally; never send it in chat or email.');
  if (config.voice_provider !== 'elevenlabs' || !config.default_voice_id || !config.voice_verified || !config.listening_approval?.startsWith('approved')) fail('Verified personal voice and approved listening sample required.');
  const text = readFileSync(resolve(arg('--text-file')), 'utf8').replace(/^\uFEFF/, '').trim();
  if (!text || text.length > 4000) fail('Expected 1–4000 characters per bounded narration request.');
  if (/איי[־ -]?פיל|היי[־ -]?פיל/.test(text)) fail('Use Latin I FEEL in narration, per Oren pronunciation guidance.');
  const output = resolve(arg('--output'));
  const metadata = output + '.alignment.json';
  if (existsSync(output) || existsSync(metadata)) fail('Output already exists; reuse it or choose a new output explicitly.');
  const request = async (path, body) => {
    const response = await fetch('https://api.elevenlabs.io' + path, { method: body ? 'POST' : 'GET', headers: { 'xi-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(body ? 120000 : 20000) });
    if (!response.ok) fail('ElevenLabs HTTP ' + response.status + '; no automatic retry.');
    return response.json();
  };
  const subscription = await request('/v1/user/subscription');
  const remaining = subscription.character_limit - subscription.character_count;
  if (subscription.status !== 'active' || !Number.isFinite(remaining) || remaining < text.length * 3) fail('Included quota not sufficient or unknown. No overage is authorized.');
  const { voices } = await request('/v1/voices');
  const voice = voices.find(v => v.voice_id === config.default_voice_id);
  if (!voice?.is_owner || voice.name !== config.voice_owner) fail('Personal voice ownership/name mismatch.');
  const models = await request('/v1/models');
  const model = models.find(m => m.model_id === config.model_id);
  if (!model?.can_do_text_to_speech || !model.languages?.some(l => l.language_id === config.language)) fail('Selected TTS model/language not verified.');
  if (argv.includes('--dry-run')) {
    console.log(JSON.stringify({ status: 'READY_WITHIN_INCLUDED_QUOTA', voice_id: voice.voice_id, model_id: model.model_id, requested_characters: text.length, quota_remaining: remaining, synthesis_performed: false }));
  } else {
    const payload = await request('/v1/text-to-speech/' + encodeURIComponent(voice.voice_id) + '/with-timestamps?output_format=mp3_44100_128', { text, model_id: model.model_id, language_code: config.language, voice_settings: config.voice_settings });
    if (!payload.audio_base64) fail('No audio returned; inspect account generation history before retrying.');
    writeFileSync(output, Buffer.from(payload.audio_base64, 'base64'), { flag: 'wx' });
    writeFileSync(metadata, JSON.stringify({ text, voice_id: voice.voice_id, model_id: model.model_id, voice_settings: config.voice_settings, alignment: payload.alignment, normalized_alignment: payload.normalized_alignment, created_at: new Date().toISOString() }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ status: payload.alignment ? 'GENERATED_WITH_TIMING' : 'GENERATED_NEEDS_ALIGNMENT', output, metadata, requested_characters: text.length }));
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'STOPPED', reason: String(error.message).replaceAll(key || '\u0000', '[redacted]') }));
  process.exitCode = 1;
}
