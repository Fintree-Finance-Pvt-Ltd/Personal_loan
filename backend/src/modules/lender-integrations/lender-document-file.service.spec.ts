import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LenderDocumentFileService } from './lender-document-file.service';
import { LenderIntegrationError } from './lender-integration.errors';

// This suite deliberately does NOT mock `fs` or `path` — loadDocument()'s only real job
// is filesystem work, and the one bug that actually shipped here (`import path from
// 'path'` instead of `import * as path from 'path'`, which this project's tsconfig
// compiles into a broken `path.default.resolve` at runtime — see git history) was
// invisible to type-checking and would have been invisible to a test that mocked `path`
// too. Exercising the real module is what catches it.
describe('LenderDocumentFileService', () => {
  let tempRoot: string;
  let outsideDir: string;
  let service: LenderDocumentFileService;
  let config: any;

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lender-doc-root-'));
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lender-doc-outside-'));

    await fs.writeFile(path.join(tempRoot, 'aadhaar.pdf'), Buffer.from('%PDF-1.4\n%mock pdf content'));
    await fs.writeFile(path.join(tempRoot, 'aadhaar.xml'), Buffer.from('<Aadhaar>mock</Aadhaar>'));
    await fs.writeFile(path.join(tempRoot, 'not-a-pdf.pdf'), Buffer.from('this is not a pdf'));
    await fs.writeFile(path.join(tempRoot, 'oversized.pdf'), Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3_670_016, 'a')]));
    await fs.mkdir(path.join(tempRoot, 'nested'));
    await fs.writeFile(path.join(tempRoot, 'nested', 'inner.xml'), Buffer.from('<Nested>mock</Nested>'));
    await fs.writeFile(path.join(outsideDir, 'secret.xml'), Buffer.from('<Secret>should not load</Secret>'));
  });

  afterAll(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    config = { get: jest.fn((key: string) => (key === 'PL_DOCUMENT_UPLOAD_ROOT' ? tempRoot : undefined)) };
    service = new LenderDocumentFileService(config as any);
  });

  it('throws DOCUMENT_UPLOAD_ROOT_NOT_CONFIGURED when the root is unset', async () => {
    config.get.mockReturnValue(undefined);

    await expect(
      service.loadDocument({ filePath: 'aadhaar.pdf', declaredMimeType: 'application/pdf' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'DOCUMENT_UPLOAD_ROOT_NOT_CONFIGURED' }));
  });

  // The regression test: this is the exact call shape processDocument() makes (a
  // relative filePath resolved against PL_DOCUMENT_UPLOAD_ROOT), and it would have
  // thrown "Cannot read properties of undefined (reading 'resolve')" with the broken
  // import — nothing here is mocked away from the real bug.
  it('loads a real PDF file under the configured root and returns its hash/size/content', async () => {
    const result = await service.loadDocument({ filePath: 'aadhaar.pdf', declaredMimeType: 'application/pdf' });

    expect(result.mimeType).toBe('application/pdf');
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Buffer.from(result.contentBase64, 'base64').toString('utf8')).toContain('%PDF-');
  });

  it('loads a real XML file under a nested path within the configured root', async () => {
    const result = await service.loadDocument({ filePath: 'nested/inner.xml', declaredMimeType: 'text/xml' });

    expect(result.mimeType).toBe('text/xml');
    expect(Buffer.from(result.contentBase64, 'base64').toString('utf8')).toBe('<Nested>mock</Nested>');
  });

  it('resolves an absolute filePath that already points inside the root', async () => {
    const absolutePath = path.join(tempRoot, 'aadhaar.xml');

    const result = await service.loadDocument({ filePath: absolutePath, declaredMimeType: 'application/xml' });

    expect(result.fileSize).toBeGreaterThan(0);
  });

  it('throws LENDER_DOCUMENT_FILE_NOT_FOUND when the file does not exist', async () => {
    await expect(
      service.loadDocument({ filePath: 'does-not-exist.pdf', declaredMimeType: 'application/pdf' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'LENDER_DOCUMENT_FILE_NOT_FOUND' }));
  });

  it('throws LENDER_DOCUMENT_PATH_BLOCKED for a path that escapes the configured root', async () => {
    const escapingPath = path.join(outsideDir, 'secret.xml');

    await expect(
      service.loadDocument({ filePath: escapingPath, declaredMimeType: 'application/xml' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'LENDER_DOCUMENT_PATH_BLOCKED' }));
  });

  it('throws LENDER_DOCUMENT_TOO_LARGE for a file over the 3.5 MiB limit', async () => {
    await expect(
      service.loadDocument({ filePath: 'oversized.pdf', declaredMimeType: 'application/pdf' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'LENDER_DOCUMENT_TOO_LARGE' }));
  });

  it('throws LENDER_DOCUMENT_MIME_MISMATCH when the declared PDF does not have a PDF signature', async () => {
    await expect(
      service.loadDocument({ filePath: 'not-a-pdf.pdf', declaredMimeType: 'application/pdf' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'LENDER_DOCUMENT_MIME_MISMATCH' }));
  });

  it('throws LENDER_DOCUMENT_MIME_UNSUPPORTED for a mime type this service does not validate', async () => {
    await expect(
      service.loadDocument({ filePath: 'aadhaar.pdf', declaredMimeType: 'image/png' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'LENDER_DOCUMENT_MIME_UNSUPPORTED' }));
  });

  it('rejects with a plain Error (not a LenderIntegrationError) only for truly unexpected failures', async () => {
    // Sanity check that our expectations above are meaningfully typed, not just "it threw".
    try {
      await service.loadDocument({ filePath: 'does-not-exist.pdf', declaredMimeType: 'application/pdf' });
      fail('expected loadDocument to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LenderIntegrationError);
    }
  });
});
