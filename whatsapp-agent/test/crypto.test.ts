import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../src/utils/crypto.js';
const original = 'miClave#Secreta123';
const enc = encrypt(original);
assert.notEqual(enc, original);
assert.equal(enc.split(':').length, 3);
assert.equal(decrypt(enc), original);
assert.equal(decrypt(enc.slice(0, -4) + 'XXXX'), null); // tag inválido → null
console.log('✓ crypto AES-256-GCM: round-trip OK, formato iv:tag:ct, tag inválido → null');
