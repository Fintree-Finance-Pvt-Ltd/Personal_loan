/*
 * End-to-end validation of the FaceMatch card-side assumption: can Digitap extract a face
 * from the stored DigiLocker Aadhaar PDF (input_pdf2) and compare it to the watermarked
 * live selfie (input_image1)?
 *
 * Uses the exact files and the exact request shape FaceMatchService builds in production.
 */
require('dotenv').config();
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');

// Read from .env rather than hardcoding — this file is tracked in git.
const URL =
  process.env.FACE_MATCH_API_URL ||
  (process.env.FACE_LIVENESS_API_URL || '').replace(/face-liveness\/?$/, 'face-match');
const CLIENT_ID = process.env.FACE_MATCH_CLIENT_ID || process.env.FACE_LIVENESS_CLIENT_ID;
const CLIENT_SECRET = process.env.FACE_MATCH_CLIENT_SECRET || process.env.FACE_LIVENESS_CLIENT_SECRET;

if (!URL || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set FACE_MATCH_API_URL (or FACE_LIVENESS_API_URL) plus the client id/secret in .env');
  process.exit(1);
}

const AUTH = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;

const PAIRS = [
  {
    customer: 46,
    selfie: 'uploads/customer-documents/live-photo/2026/08/customer-46-live-photo-1786093783583-9304.jpg',
    aadhaar: 'uploads/customer-documents/digilocker/2026/08/digilocker-DIGILOCKER-46-488d4282.pdf',
  },
  {
    customer: 47,
    selfie: 'uploads/customer-documents/live-photo/2026/08/customer-47-live-photo-1786097371302-8758.jpg',
    aadhaar: 'uploads/customer-documents/digilocker/2026/08/digilocker-DIGILOCKER-47-fd790e47.pdf',
  },
  {
    customer: 58,
    selfie: 'uploads/customer-documents/live-photo/2026/08/customer-58-live-photo-1786439817272-1616.jpg',
    aadhaar: 'uploads/customer-documents/digilocker/2026/08/digilocker-DIGILOCKER-58-ba2bf61b.pdf',
  },
];

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

async function run(pair) {
  console.log(`\n================ CUSTOMER ${pair.customer} ================`);
  const selfie = fs.readFileSync(pair.selfie);
  const aadhaar = fs.readFileSync(pair.aadhaar);
  console.log(`  selfie  ${kb(selfie.length)}   aadhaar pdf ${kb(aadhaar.length)}   total ${kb(selfie.length + aadhaar.length)}`);

  const form = new FormData();
  form.append('input_image1', selfie, { filename: 'live.jpg', contentType: 'image/jpeg' });
  form.append('input_pdf2', aadhaar, { filename: 'aadhaar.pdf', contentType: 'application/pdf' });
  form.append('client_ref_num', `E2E_${pair.customer}_${Date.now()}`.slice(0, 45));

  try {
    const res = await axios.post(URL, form, {
      headers: { ...form.getHeaders(), accept: 'application/json', authorization: AUTH },
      timeout: 60000,
      validateStatus: () => true,
    });
    console.log(`  HTTP ${res.status}`);
    const r = res.data?.result;
    if (r) {
      console.log(`    is_same_face                      : ${r.is_same_face}`);
      console.log(`    same_face_confidence              : ${r.same_face_confidence}`);
      console.log(`    person_image_correctly_identified : ${r.person_image_correctly_identified}   <-- selfie face found?`);
      console.log(`    card_image_correctly_identified   : ${r.card_image_correctly_identified}   <-- AADHAAR PDF face found?`);
      console.log(`    is_person_image_blurry            : ${r.is_person_image_blurry}`);
      console.log(`    is_card_image_blurry              : ${r.is_card_image_blurry}`);
    } else {
      console.log(`    ${JSON.stringify(res.data).slice(0, 400)}`);
    }
  } catch (err) {
    console.log(`  ERROR ${err.code || ''} ${err.message}`);
  }
}

(async () => {
  for (const pair of PAIRS) await run(pair);
})();
