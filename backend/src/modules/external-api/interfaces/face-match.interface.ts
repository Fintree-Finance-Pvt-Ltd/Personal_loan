/**
 * Digitap FaceMatch (/fmfl/v4/face-match) — compares a person photo against the photo
 * on an identity card.
 *
 * The provider documents every result field as a String ("true"/"false") but the live
 * API returns real JSON booleans, so every flag is typed loosely here and normalized
 * through `toBool` in FaceMatchService rather than trusted as-is.
 */
export interface DigitapFaceMatchResult {
  is_same_face: boolean | string;
  is_person_image_blurry: boolean | string;
  is_card_image_blurry: boolean | string;
  same_face_confidence: number | string;
  person_image_correctly_identified: boolean | string;
  card_image_correctly_identified: boolean | string;
}

export interface DigitapFaceMatchResponse {
  status: 'success' | 'failure';
  client_ref_num: string;
  /** The provider spells this `req_Id` in its success sample and `req_id` in its error samples. */
  req_id?: string;
  req_Id?: string;
  http_status_code: number;
  message?: string;
  result: DigitapFaceMatchResult | null;
}

export interface RunFaceMatchOptions {
  /** Re-run even when a MATCHED/NOT_MATCHED result is already stored for this application. */
  force?: boolean;
}
