export interface DigitapFaceLivenessResult {
  is_live: boolean;
  liveness_confidence: number;
  person_image_correctly_identified: boolean;
  multiple_face_detected: boolean;
  eye_closed: boolean;
  is_person_image_blurry: boolean;
  has_mask: boolean;
  mask_confidence: number;
  is_face_aligned: boolean;
  is_low_light_image: boolean;
  is_face_occluded: boolean;
  occlusion_confidence: number;
  is_ai_generated?: boolean | null;
  ai_check_confidence?: number | null;
}

export interface DigitapFaceLivenessResponse {
  status: 'success' | 'failure';
  client_ref_num: string;
  req_id: string;
  http_status_code: number;
  message?: string;
  result: DigitapFaceLivenessResult | null;
}

export interface VerifyFaceLivenessInput {
  customerId: string | bigint;
  applicationId?: string | bigint;
  inputImage: string; // Base64 string, image URL, or image content
  clientRefNum?: string;
  allowDeepfake?: 'yes' | 'no';
}
