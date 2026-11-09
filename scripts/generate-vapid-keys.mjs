const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);

const [publicKey, privateKey, rawPublicKey] = await Promise.all([
  crypto.subtle.exportKey('jwk', keys.publicKey),
  crypto.subtle.exportKey('jwk', keys.privateKey),
  crypto.subtle.exportKey('raw', keys.publicKey),
]);

const applicationServerKey = Buffer.from(new Uint8Array(rawPublicKey)).toString('base64url');
const vapidKeys = JSON.stringify({ publicKey, privateKey });

console.log('Clés VAPID générées. Ne les commit jamais.');
console.log('');
console.log('1) Dans .env.local, pour le navigateur :');
console.log(`VITE_VAPID_PUBLIC_KEY=${applicationServerKey}`);
console.log('');
console.log('2) Dans supabase/.env.functions.local, pour la fonction Edge :');
console.log(`VAPID_KEYS='${vapidKeys}'`);
console.log('PUSH_CONTACT=adresse@exemple.com');
console.log('');
console.log('3) Envoie les secrets au projet :');
console.log('npx supabase secrets set --env-file supabase/.env.functions.local');
