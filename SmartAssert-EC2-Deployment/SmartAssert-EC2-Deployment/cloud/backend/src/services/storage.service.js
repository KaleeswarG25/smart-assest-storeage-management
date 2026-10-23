const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');
const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Validates actual binary content of the file buffer to verify it is genuinely
 * an allowed image format (JPEG, PNG, WebP) and not an executable, script, PDF, or CSV.
 *
 * Magic bytes:
 * - JPEG: FF D8 FF
 * - PNG:  89 50 4E 47 0D 0A 1A 0A
 * - WEBP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
 */
function detectAndValidateImageFormat(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    const err = new Error('Invalid or corrupted image file content.');
    err.statusCode = 400;
    throw err;
  }

  // 1. JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }

  // 2. PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return { mime: 'image/png', ext: '.png' };
  }

  // 3. WEBP (RIFF....WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }

  // Reject all other file formats (PDFs, executables, CSVs, scripts, etc.)
  const err = new Error(
    'Unsupported file type or invalid image header. Cloud storage accepts only purchase bill images in JPEG, PNG, or WebP format.'
  );
  err.statusCode = 400;
  throw err;
}

/**
 * Storage Service Dedicated to Asset Purchase Bills / Invoices.
 *
 * Implements strict single-purpose Google Cloud Storage integration:
 * - Uses official @google-cloud/storage SDK with Application Default Credentials (ADC) on Cloud Run.
 * - Stores ONLY user-uploaded bill images (JPEG, PNG, WebP).
 * - Enforces server-side binary magic-number validation and configurable size limits.
 * - Generates secure, unguessable object paths: bills/bill_<timestamp>_<hex>.<ext>
 * - Keeps buckets private; provides authenticated streaming and short-lived signed URLs.
 * - Provides graceful local fallback adapter for local development and offline automated tests.
 */
class StorageService {
  constructor() {
    this.uploadDir = path.resolve(__dirname, '../../../data/uploads/bills');
    this.gcsClient = null;
    this.s3Client = null;
  }

  /**
   * Returns current active storage provider ('s3', 'gcs' or 'local').
   */
  getProvider() {
    const provider = (process.env.STORAGE_PROVIDER || '').toLowerCase();
    if (provider === 's3') return 's3';
    const gcsEnabled = (process.env.GCS_ENABLED || '').toLowerCase() === 'true';
    if (gcsEnabled || provider === 'gcs') return 'gcs';
    return 'local';
  }

  /**
   * Lazily initializes Google Cloud Storage client using Application Default Credentials (ADC).
   */
  getGcsClient() {
    if (!this.gcsClient) {
      this.gcsClient = new Storage();
    }
    return this.gcsClient;
  }

  getS3Client() {
    if (!this.s3Client) {
      this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
    }
    return this.s3Client;
  }

  /**
   * Ensures the local upload directory exists when using the local storage adapter.
   */
  ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Validates and sanitizes a Cloud Storage object name to prevent path manipulation or traversal.
   */
  sanitizeObjectName(objectName) {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('Object name is required.');
    }
    const clean = objectName.trim().replace(/\\/g, '/');
    if (clean.includes('..') || clean.startsWith('/') || !clean.startsWith('bills/')) {
      const err = new Error('Invalid or unauthorized object name path.');
      err.statusCode = 400;
      throw err;
    }
    return clean;
  }

  /**
   * Uploads an asset bill image to Amazon S3, Google Cloud Storage, or local fallback.
   *
   * @param {Object} params
   * @param {string} params.base64Data - Base64 encoded image string (or data: URL)
   * @param {string} [params.fileName] - Original client-side file name
   * @returns {Promise<{ objectName: string, url: string, fileName: string, originalName: string, provider: string, sizeBytes: number, mimeType: string }>}
   */
  async uploadBillImage({ base64Data, fileName = 'asset_bill.jpg' }) {
    if (!base64Data || typeof base64Data !== 'string') {
      const err = new Error('No bill image data provided.');
      err.statusCode = 400;
      throw err;
    }

    // Extract actual base64 payload if encoded as data URL
    let cleanBase64 = base64Data;
    const dataUrlMatches = base64Data.match(/^data:([A-Za-z0-9\-+\/.]+);base64,(.+)$/);
    if (dataUrlMatches && dataUrlMatches.length === 3) {
      cleanBase64 = dataUrlMatches[2];
    }

    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0) {
      const err = new Error('Invalid or empty bill image file.');
      err.statusCode = 400;
      throw err;
    }

    // Configurable maximum file size check (Default 15MB)
    const maxUploadBytes = parseInt(process.env.GCS_MAX_UPLOAD_BYTES || '15728640', 10);
    if (buffer.length > maxUploadBytes) {
      const limitMb = (maxUploadBytes / (1024 * 1024)).toFixed(0);
      const actualMb = (buffer.length / (1024 * 1024)).toFixed(2);
      const err = new Error(`Bill image size (${actualMb}MB) exceeds maximum allowed limit of ${limitMb}MB.`);
      err.statusCode = 400;
      throw err;
    }

    // Strict content validation: magic number signature check
    const detected = detectAndValidateImageFormat(buffer);

    // Route upload based on configured provider
    const provider = this.getProvider();
    if (provider === 's3') return await this.uploadToS3({ buffer, originalName: fileName, detected });
    if (provider === 'gcs') return await this.uploadToGCS({ buffer, originalName: fileName, detected });
    return await this.uploadToLocal({ buffer, originalName: fileName, detected });
  }

  /** Amazon S3 upload using the EC2 instance role (no static AWS keys). */
  async uploadToS3({ buffer, originalName, detected }) {
    const bucketName = process.env.S3_BUCKET_NAME;
    if (!bucketName) throw new Error('S3_BUCKET_NAME is required when STORAGE_PROVIDER=s3.');
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const objectName = `bills/bill_${Date.now()}_${uniqueId}${detected.ext}`;
    await this.getS3Client().send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectName,
      Body: buffer,
      ContentType: detected.mime,
      CacheControl: 'private, max-age=3600',
      Metadata: {
        originalname: path.basename(originalName).substring(0, 100),
        uploadedat: new Date().toISOString()
      },
      ServerSideEncryption: 'AES256'
    }));
    const fileName = path.basename(objectName);
    return { objectName, url: `/api/assets/bills/${fileName}`, fileName, originalName, provider: 's3', sizeBytes: buffer.length, mimeType: detected.mime };
  }

  /**
   * Google Cloud Storage Upload Implementation
   */
  async uploadToGCS({ buffer, originalName, detected }) {
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
      console.warn('[StorageService] GCS_BUCKET_NAME not set. Falling back to local storage adapter.');
      return await this.uploadToLocal({ buffer, originalName, detected });
    }

    // Object naming: bills/bill_<timestamp>_<randomHex><ext>
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const objectName = `bills/bill_${Date.now()}_${uniqueId}${detected.ext}`;

    try {
      const storage = this.getGcsClient();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(objectName);

      await file.save(buffer, {
        contentType: detected.mime,
        metadata: {
          contentType: detected.mime,
          cacheControl: 'private, max-age=3600',
          metadata: {
            originalName: path.basename(originalName).substring(0, 100),
            uploadedAt: new Date().toISOString()
          }
        },
        resumable: false
      });

      const objectBase = path.basename(objectName);
      // Relative authenticated retrieval route
      const url = `/api/assets/bills/${objectBase}`;

      return {
        objectName,
        url,
        fileName: objectBase,
        originalName,
        provider: 'gcs',
        sizeBytes: buffer.length,
        mimeType: detected.mime
      };
    } catch (gcsError) {
      console.warn('[StorageService] GCS upload failed, seamlessly falling back to local disk storage:', gcsError.message);
      return await this.uploadToLocal({ buffer, originalName, detected });
    }
  }

  /**
   * Local Disk Storage Fallback Adapter
   */
  async uploadToLocal({ buffer, originalName, detected }) {
    this.ensureUploadDir();

    const uniqueId = crypto.randomBytes(8).toString('hex');
    const safeBase = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30) || 'bill';
    const storedFileName = `bill_${Date.now()}_${uniqueId}_${safeBase}${detected.ext}`;
    const filePath = path.join(this.uploadDir, storedFileName);

    await fs.promises.writeFile(filePath, buffer);

    const objectName = `bills/${storedFileName}`;
    const url = `/uploads/bills/${storedFileName}`;

    return {
      objectName,
      url,
      fileName: storedFileName,
      originalName,
      provider: 'local',
      sizeBytes: buffer.length,
      mimeType: detected.mime
    };
  }

  /**
   * Deletes a bill image object from storage.
   */
  async deleteBillImage(objectName) {
    if (!objectName) return { deleted: false };

    try {
      const cleanName = this.sanitizeObjectName(objectName);
      const provider = this.getProvider();

      if (provider === 's3') {
        const bucketName = process.env.S3_BUCKET_NAME;
        if (!bucketName) return { deleted: false };
        await this.getS3Client().send(new DeleteObjectCommand({ Bucket: bucketName, Key: cleanName }));
        return { deleted: true, provider: 's3', objectName: cleanName };
      }

      if (provider === 'gcs') {
        const bucketName = process.env.GCS_BUCKET_NAME;
        if (!bucketName) return { deleted: false };

        const bucket = this.getGcsClient().bucket(bucketName);
        await bucket.file(cleanName).delete({ ignoreNotFound: true });
        return { deleted: true, provider: 'gcs', objectName: cleanName };
      }

      // Local adapter
      const fileName = path.basename(cleanName);
      const filePath = path.join(this.uploadDir, fileName);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      return { deleted: true, provider: 'local', objectName: cleanName };
    } catch (err) {
      console.warn(`[StorageService] Note: Non-critical deletion warning for '${objectName}': ${err.message}`);
      return { deleted: false, error: err.message };
    }
  }

  /**
   * Retrieves metadata for a stored bill image.
   */
  async getBillImageMetadata(objectName) {
    const cleanName = this.sanitizeObjectName(objectName);
    const provider = this.getProvider();

    if (provider === 's3') {
      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) throw new Error('S3_BUCKET_NAME not configured.');
      const head = await this.getS3Client().send(new HeadObjectCommand({ Bucket: bucketName, Key: cleanName }));
      return { objectName: cleanName, sizeBytes: Number(head.ContentLength || 0), contentType: head.ContentType, updated: head.LastModified, provider: 's3' };
    }

    if (provider === 'gcs') {
      const bucketName = process.env.GCS_BUCKET_NAME;
      if (!bucketName) throw new Error('GCS_BUCKET_NAME not configured.');

      const bucket = this.getGcsClient().bucket(bucketName);
      const [metadata] = await bucket.file(cleanName).getMetadata();
      return {
        objectName: cleanName,
        sizeBytes: parseInt(metadata.size, 10),
        contentType: metadata.contentType,
        updated: metadata.updated,
        provider: 'gcs'
      };
    }

    const fileName = path.basename(cleanName);
    const filePath = path.join(this.uploadDir, fileName);
    if (!fs.existsSync(filePath)) {
      const err = new Error(`Bill image file '${fileName}' not found.`);
      err.statusCode = 404;
      throw err;
    }

    const stats = await fs.promises.stat(filePath);
    return {
      objectName: cleanName,
      sizeBytes: stats.size,
      updated: stats.mtime.toISOString(),
      provider: 'local'
    };
  }

  /**
   * Generates a short-lived v4 signed URL for secure, direct browser reading from private GCS bucket.
   */
  async getBillImageSignedUrl(objectName, { expiresInMinutes = 15 } = {}) {
    const cleanName = this.sanitizeObjectName(objectName);
    const provider = this.getProvider();

    if (provider === 's3') {
      // Keep the bucket private; the authenticated API route streams the object.
      return `/api/assets/bills/${path.basename(cleanName)}`;
    }
    if (provider !== 'gcs') return `/uploads/bills/${path.basename(cleanName)}`;

    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('GCS_BUCKET_NAME is not configured.');
    }

    const bucket = this.getGcsClient().bucket(bucketName);
    const file = bucket.file(cleanName);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + Math.max(1, Math.min(60, expiresInMinutes)) * 60 * 1000
    });

    return signedUrl;
  }

  /**
   * Streams a stored bill image to an Express response with appropriate headers.
   */
  async streamBillImage(res, objectName) {
    const cleanName = this.sanitizeObjectName(objectName);
    const fileName = path.basename(cleanName);
    const localFilePath = path.join(this.uploadDir, fileName);

    // 1. If file exists on local disk, stream it directly
    if (fs.existsSync(localFilePath)) {
      let contentType = 'image/jpeg';
      if (fileName.endsWith('.png')) contentType = 'image/png';
      else if (fileName.endsWith('.webp')) contentType = 'image/webp';
      else if (fileName.endsWith('.pdf')) contentType = 'application/pdf';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return fs.createReadStream(localFilePath).pipe(res);
    }

    // 2. Otherwise try Amazon S3 using the EC2 instance role.
    if (this.getProvider() === 's3') {
      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) return res.status(500).json({ success: false, error: 'S3_BUCKET_NAME is not configured.' });
      try {
        const result = await this.getS3Client().send(new GetObjectCommand({ Bucket: bucketName, Key: cleanName }));
        res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        if (result.ContentLength) res.setHeader('Content-Length', result.ContentLength);
        result.Body.pipe(res);
        return;
      } catch (s3Err) {
        if (s3Err.name === 'NoSuchKey' || s3Err.$metadata?.httpStatusCode === 404) return res.status(404).json({ success: false, error: 'Bill image not found in S3.' });
        throw s3Err;
      }
    }

    // 3. Otherwise try Google Cloud Storage
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (bucketName) {
      try {
        const bucket = this.getGcsClient().bucket(bucketName);
        const file = bucket.file(cleanName);
        const [exists] = await file.exists();
        if (exists) {
          const [metadata] = await file.getMetadata();
          res.setHeader('Content-Type', metadata.contentType || 'image/jpeg');
          res.setHeader('Cache-Control', 'private, max-age=3600');
          return file.createReadStream().pipe(res);
        }
      } catch (gcsErr) {
        console.warn('[StorageService] GCS stream lookup failed:', gcsErr.message);
      }
    }

    return res.status(404).json({ success: false, error: 'Bill image not found on server disk or cloud storage.' });
  }
}

module.exports = new StorageService();
