import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import * as fs from 'fs';
import { FaceMatchService } from './face-match.service';

describe('FaceMatchService', () => {
  let service: FaceMatchService;
  let prisma: any;
  let httpService: any;

  const configValues: Record<string, string> = {
    FACE_LIVENESS_API_URL: 'https://svcdemo.digitap.work/fmfl/v4/face-liveness',
    FACE_LIVENESS_CLIENT_ID: 'client-id',
    FACE_LIVENESS_CLIENT_SECRET: 'client-secret',
  };

  const configService: any = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
    get: jest.fn((key: string, fallback?: any) => configValues[key] ?? fallback),
  };

  const application = { id: 5n, customerId: 3n, applicationNumber: 'APP-001' };
  const livePhoto = {
    id: 101n,
    fileName: 'live.jpg',
    filePath: 'uploads/customer-documents/live-photo/2026/09/live.jpg',
    fileUrl: '/uploads/customer-documents/live-photo/2026/09/live.jpg',
    mimeType: 'image/jpeg',
  };
  const aadhaarDoc = {
    id: 102n,
    fileName: 'aadhaar.pdf',
    filePath: 'C:/app/uploads/customer-documents/digilocker/2026/09/aadhaar.pdf',
    fileUrl: '/uploads/customer-documents/digilocker/2026/09/aadhaar.pdf',
    mimeType: 'application/pdf',
  };

  /** Makes plCustomerDocument.findFirst answer per documentType, like the real query does. */
  const documentsOnFile = (live: any, aadhaar: any) =>
    jest.fn(({ where }: any) =>
      Promise.resolve(where.documentType === 'CUSTOMER_LIVE_PHOTO' ? live : aadhaar),
    );

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('binary-image-bytes'));

    prisma = {
      plApplication: { findUnique: jest.fn().mockResolvedValue(application) },
      plCustomerDocument: { findFirst: documentsOnFile(livePhoto, aadhaarDoc) },
      applicationFaceMatch: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(({ create }: any) => Promise.resolve({ id: 'FM-1', ...create })),
      },
    };
    httpService = { post: jest.fn() };

    service = new FaceMatchService(prisma, httpService, configService);
  });

  const respondWith = (result: any, status: 'success' | 'failure' = 'success') =>
    httpService.post.mockReturnValue(
      of({ data: { status, client_ref_num: 'FM_5_1', req_id: 'REQ-1', http_status_code: 200, result } }),
    );

  // Digitap issues per-product credentials: the fmfl pair (liveness/match) is a different
  // account from the ent/v1 pair used for DigiLocker Aadhaar KYC. face-match is fmfl, so it
  // must default to the liveness pair — but stay overridable if Digitap says otherwise.
  it('authenticates with the face-liveness credentials by default', async () => {
    respondWith({ is_same_face: true, same_face_confidence: 0.9 });

    await service.runForApplication(5n);

    const { authorization } = httpService.post.mock.calls[0][2].headers;
    expect(authorization).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
  });

  it('lets FACE_MATCH_CLIENT_ID/SECRET override the credentials without a code change', async () => {
    const overridden = new FaceMatchService(prisma, httpService, {
      ...configService,
      get: jest.fn((key: string, fallback?: any) =>
        ({
          ...configValues,
          FACE_MATCH_CLIENT_ID: 'aadhaar-id',
          FACE_MATCH_CLIENT_SECRET: 'aadhaar-secret',
        })[key] ?? fallback,
      ),
    } as any);
    respondWith({ is_same_face: true, same_face_confidence: 0.9 });

    await overridden.runForApplication(5n);

    const { authorization } = httpService.post.mock.calls[0][2].headers;
    expect(authorization).toBe(
      `Basic ${Buffer.from('aadhaar-id:aadhaar-secret').toString('base64')}`,
    );
  });

  it('derives the face-match URL from the face-liveness URL so one env switch moves both', () => {
    expect(httpService.post).not.toHaveBeenCalled();
    respondWith({ is_same_face: true, same_face_confidence: 0.9 });
    return service.runForApplication(5n).then(() => {
      expect(httpService.post).toHaveBeenCalledWith(
        'https://svcdemo.digitap.work/fmfl/v4/face-match',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: expect.stringMatching(/^Basic /) }),
        }),
      );
    });
  });

  it('records MATCHED with the confidence when the provider says the faces are the same', async () => {
    respondWith({
      is_same_face: true,
      is_person_image_blurry: false,
      is_card_image_blurry: false,
      same_face_confidence: 0.9312,
      person_image_correctly_identified: true,
      card_image_correctly_identified: true,
    });

    await service.runForApplication(5n);

    const written = prisma.applicationFaceMatch.upsert.mock.calls[0][0].create;
    expect(written.status).toBe('MATCHED');
    expect(written.isSameFace).toBe(true);
    expect(Number(written.sameFaceConfidence)).toBeCloseTo(0.9312, 6);
    expect(written.livePhotoDocumentId).toBe(101n);
    expect(written.aadhaarDocumentId).toBe(102n);
  });

  // The provider documents every result flag as a String even though the live API returns
  // JSON booleans, so "false" must not be read as truthy.
  it('treats the provider\'s stringified booleans the same as real booleans', async () => {
    respondWith({
      is_same_face: 'false',
      is_person_image_blurry: 'true',
      same_face_confidence: '0.2885',
      person_image_correctly_identified: 'true',
      card_image_correctly_identified: 'true',
    });

    await service.runForApplication(5n);

    const written = prisma.applicationFaceMatch.upsert.mock.calls[0][0].create;
    expect(written.status).toBe('NOT_MATCHED');
    expect(written.isSameFace).toBe(false);
    expect(written.personImageBlurry).toBe(true);
    expect(Number(written.sameFaceConfidence)).toBeCloseTo(0.2885, 6);
  });

  it('sends the DigiLocker Aadhaar as input_pdf2 and the selfie as input_image1', async () => {
    respondWith({ is_same_face: true, same_face_confidence: 0.8 });

    await service.runForApplication(5n);

    const body = httpService.post.mock.calls[0][1].getBuffer().toString();
    expect(body).toContain('name="input_image1"');
    expect(body).toContain('name="input_pdf2"');
    expect(body).not.toContain('name="input_image2"');
  });

  it('sends an image-typed Aadhaar as input_image2 instead of input_pdf2', async () => {
    prisma.plCustomerDocument.findFirst = documentsOnFile(livePhoto, {
      ...aadhaarDoc,
      mimeType: 'image/jpeg',
      fileName: 'aadhaar.jpg',
    });
    respondWith({ is_same_face: true, same_face_confidence: 0.8 });

    await service.runForApplication(5n);

    const body = httpService.post.mock.calls[0][1].getBuffer().toString();
    expect(body).toContain('name="input_image2"');
    expect(body).not.toContain('name="input_pdf2"');
  });

  // Repeat customers don't re-capture a selfie for a second loan, so their only live photo
  // is attached to an EARLIER application. Scoping strictly to this application reported
  // "no live photograph" for every returning borrower.
  it('falls back to the customer\'s earlier live photo when this application has none of its own', async () => {
    prisma.plCustomerDocument.findFirst = jest.fn(({ where }: any) => {
      if (where.documentType === 'AADHAAR_CARD') return Promise.resolve(aadhaarDoc);
      // Only the unscoped lookup (no OR clause) finds the previous application's selfie.
      return Promise.resolve(where.OR ? null : { ...livePhoto, id: 99n });
    });
    respondWith({ is_same_face: true, same_face_confidence: 0.95 });

    await service.runForApplication(5n);

    const written = prisma.applicationFaceMatch.upsert.mock.calls[0][0].create;
    expect(written.status).toBe('MATCHED');
    expect(written.livePhotoDocumentId).toBe(99n);
  });

  it('prefers this application\'s own live photo over an earlier one', async () => {
    prisma.plCustomerDocument.findFirst = jest.fn(({ where }: any) => {
      if (where.documentType === 'AADHAAR_CARD') return Promise.resolve(aadhaarDoc);
      return Promise.resolve(where.OR ? livePhoto : { ...livePhoto, id: 99n });
    });
    respondWith({ is_same_face: true, same_face_confidence: 0.95 });

    await service.runForApplication(5n);

    expect(prisma.applicationFaceMatch.upsert.mock.calls[0][0].create.livePhotoDocumentId).toBe(101n);
  });

  it('records SKIPPED, not an error, when the customer has no Aadhaar document yet', async () => {
    prisma.plCustomerDocument.findFirst = documentsOnFile(livePhoto, null);

    await service.runForApplication(5n);

    const written = prisma.applicationFaceMatch.upsert.mock.calls[0][0].create;
    expect(written.status).toBe('SKIPPED');
    expect(written.failureReason).toMatch(/Aadhaar/i);
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('records SKIPPED when the stored file is gone from disk rather than throwing', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    await service.runForApplication(5n);

    const written = prisma.applicationFaceMatch.upsert.mock.calls[0][0].create;
    expect(written.status).toBe('SKIPPED');
    expect(written.failureReason).toMatch(/missing on disk/i);
  });

  // Face match is advisory — a provider outage must be recorded and swallowed, never
  // propagated into the Aadhaar KYC flow that triggers it.
  it('records ERROR and does not throw when the provider call fails', async () => {
    httpService.post.mockReturnValue(
      throwError(() => new AxiosError('boom', '500', undefined, undefined, {
        status: 500, data: { message: 'Internal Server Error' },
      } as any)),
    );

    await expect(service.runForApplication(5n)).resolves.toBeDefined();

    const written = prisma.applicationFaceMatch.upsert.mock.calls[0][0].create;
    expect(written.status).toBe('ERROR');
    expect(written.failureReason).toContain('500');
  });

  it('does not re-call the provider when a conclusive result is already stored', async () => {
    prisma.applicationFaceMatch.findUnique.mockResolvedValue({ id: 'FM-1', status: 'NOT_MATCHED' });

    const result = await service.runForApplication(5n);

    expect(result).toEqual({ id: 'FM-1', status: 'NOT_MATCHED' });
    expect(httpService.post).not.toHaveBeenCalled();
  });

  // A SKIPPED row means the inputs weren't ready (Aadhaar PDF still downloading), not that
  // the answer is known — the next trigger has to actually retry.
  it('retries a previously SKIPPED result', async () => {
    prisma.applicationFaceMatch.findUnique.mockResolvedValue({ id: 'FM-1', status: 'SKIPPED' });
    respondWith({ is_same_face: true, same_face_confidence: 0.77 });

    await service.runForApplication(5n);

    expect(httpService.post).toHaveBeenCalled();
    expect(prisma.applicationFaceMatch.upsert.mock.calls[0][0].create.status).toBe('MATCHED');
  });

  it('re-runs a conclusive result when force is set, for the admin re-run button', async () => {
    prisma.applicationFaceMatch.findUnique.mockResolvedValue({ id: 'FM-1', status: 'MATCHED' });
    respondWith({ is_same_face: false, same_face_confidence: 0.1 });

    await service.runForApplication(5n, { force: true });

    expect(httpService.post).toHaveBeenCalled();
    expect(prisma.applicationFaceMatch.upsert.mock.calls[0][0].create.status).toBe('NOT_MATCHED');
  });

  it('skips the call when the two files together exceed the provider\'s 4MB payload cap', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.alloc(3 * 1024 * 1024));

    await service.runForApplication(5n);

    const written = prisma.applicationFaceMatch.upsert.mock.calls[0][0].create;
    expect(written.status).toBe('SKIPPED');
    expect(written.failureReason).toMatch(/4MB/);
    expect(httpService.post).not.toHaveBeenCalled();
  });

  // The column is DECIMAL(9,8); an out-of-range confidence would otherwise overflow and
  // throw away the entire result row.
  it('normalizes a percentage-style confidence into the 0..1 range the column allows', async () => {
    respondWith({ is_same_face: true, same_face_confidence: 93.12 });

    await service.runForApplication(5n);

    const written = prisma.applicationFaceMatch.upsert.mock.calls[0][0].create;
    expect(Number(written.sameFaceConfidence)).toBeCloseTo(0.9312, 6);
  });
});
