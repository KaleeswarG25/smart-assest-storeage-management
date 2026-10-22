const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function detectAndValidateImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    const err = new Error('Invalid or corrupted image file content.'); err.statusCode = 400; throw err;
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png' };
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: '.webp' };
  const err = new Error('Unsupported or invalid image. Upload a JPEG, PNG, or WebP image.'); err.statusCode = 400; throw err;
}

class StorageService {
  constructor() {
    this.uploadDir = path.resolve(__dirname, '../../../data/uploads/bills');
    this.s3Client = null;
  }

  getProvider() {
    const provider = (process.env.STORAGE_PROVIDER || (process.env.NODE_ENV === 'production' ? 's3' : 'local')).toLowerCase();
    if (!['s3', 'local'].includes(provider)) throw new Error('STORAGE_PROVIDER must be s3 or local.');
    return provider;
  }

  getS3Client() {
    if (!this.s3Client) {
      this.s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
    }
    return this.s3Client; // Uses the EC2 instance profile / default AWS credential chain.
  }

  getBucketName() {
    const name = process.env.S3_BUCKET_NAME;
    if (!name && this.getProvider() === 's3') throw new Error('S3_BUCKET_NAME must be configured when STORAGE_PROVIDER=s3.');
    return name;
  }

  ensureUploadDir() { fs.mkdirSync(this.uploadDir, { recursive: true }); }

  sanitizeObjectName(objectName) {
    if (!objectName || typeof objectName !== 'string') { const e = new Error('Object name is required.'); e.statusCode = 400; throw e; }
    const clean = objectName.trim().replace(/\\/g, '/');
    if (clean.includes('..') || clean.startsWith('/') || !clean.startsWith('bills/')) { const e = new Error('Invalid object name.'); e.statusCode = 400; throw e; }
    return clean;
  }

  async uploadBillImage({ base64Data, fileName = 'asset_bill.jpg' }) {
    if (!base64Data || typeof base64Data !== 'string') { const e = new Error('No bill image data provided.'); e.statusCode = 400; throw e; }
    let payload = base64Data;
    const dataUrl = base64Data.match(/^data:[A-Za-z0-9.+/-]+;base64,([\s\S]+)$/);
    if (dataUrl) payload = dataUrl[1];
    const buffer = Buffer.from(payload, 'base64');
    if (!buffer.length) { const e = new Error('Invalid or empty image.'); e.statusCode = 400; throw e; }
    const maxBytes = Number.parseInt(process.env.S3_MAX_UPLOAD_BYTES || '15728640', 10);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('S3_MAX_UPLOAD_BYTES must be a positive integer.');
    if (buffer.length > maxBytes) { const e = new Error(`Image exceeds the ${Math.round(maxBytes / 1048576)} MB upload limit.`); e.statusCode = 413; throw e; }
    const detected = detectAndValidateImageFormat(buffer);
    const provider = this.getProvider();
    const id = crypto.randomBytes(12).toString('hex');
    const objectName = `bills/bill_${Date.now()}_${id}${detected.ext}`;
    const originalName = path.basename(String(fileName)).slice(0, 150);
    if (provider === 's3') {
      const bucket = this.getBucketName();
      await this.getS3Client().send(new PutObjectCommand({
        Bucket: bucket, Key: objectName, Body: buffer, ContentType: detected.mime,
        ServerSideEncryption: process.env.S3_SSE || 'AES256',
        Metadata: { 'original-name': encodeURIComponent(originalName), 'uploaded-at': new Date().toISOString() }
      }));
      return { objectName, url: `/api/assets/bills/${path.basename(objectName)}`, fileName: path.basename(objectName), originalName, provider, sizeBytes: buffer.length, mimeType: detected.mime };
    }
    this.ensureUploadDir();
    const safeBase = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) || 'bill';
    const storedName = `bill_${Date.now()}_${id}_${safeBase}${detected.ext}`;
    await fs.promises.writeFile(path.join(this.uploadDir, storedName), buffer, { flag: 'wx' });
    const localObject = `bills/${storedName}`;
    return { objectName: localObject, url: `/api/assets/bills/${storedName}`, fileName: storedName, originalName, provider: 'local', sizeBytes: buffer.length, mimeType: detected.mime };
  }

  async deleteBillImage(objectName) {
    if (!objectName) return { deleted: false };
    const clean = this.sanitizeObjectName(objectName);
    if (this.getProvider() === 's3') {
      await this.getS3Client().send(new DeleteObjectCommand({ Bucket: this.getBucketName(), Key: clean }));
      return { deleted: true, provider: 's3', objectName: clean };
    }
    const filePath = path.join(this.uploadDir, path.basename(clean));
    await fs.promises.rm(filePath, { force: true });
    return { deleted: true, provider: 'local', objectName: clean };
  }

  async getBillImageMetadata(objectName) {
    const clean = this.sanitizeObjectName(objectName);
    if (this.getProvider() === 's3') {
      const result = await this.getS3Client().send(new HeadObjectCommand({ Bucket: this.getBucketName(), Key: clean }));
      return { objectName: clean, sizeBytes: result.ContentLength, contentType: result.ContentType, updated: result.LastModified, provider: 's3' };
    }
    const filePath = path.join(this.uploadDir, path.basename(clean));
    const stats = await fs.promises.stat(filePath);
    return { objectName: clean, sizeBytes: stats.size, updated: stats.mtime.toISOString(), provider: 'local' };
  }

  async getBillImageSignedUrl(objectName, { expiresInMinutes = 15 } = {}) {
    const clean = this.sanitizeObjectName(objectName);
    if (this.getProvider() !== 's3') return `/api/assets/bills/${path.basename(clean)}`;
    const command = new GetObjectCommand({ Bucket: this.getBucketName(), Key: clean });
    return getSignedUrl(this.getS3Client(), command, { expiresIn: Math.max(60, Math.min(3600, expiresInMinutes * 60)) });
  }

  async streamBillImage(res, objectName) {
    const clean = this.sanitizeObjectName(objectName);
    if (this.getProvider() === 's3') {
      const result = await this.getS3Client().send(new GetObjectCommand({ Bucket: this.getBucketName(), Key: clean }));
      res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');
      res.setHeader('Content-Length', result.ContentLength);
      res.setHeader('Cache-Control', 'private, no-store');
      if (result.Body && typeof result.Body.pipe === 'function') return result.Body.pipe(res);
      const bytes = await result.Body.transformToByteArray();
      return res.end(Buffer.from(bytes));
    }
    const filePath = path.join(this.uploadDir, path.basename(clean));
    const stats = await fs.promises.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', mime); res.setHeader('Content-Length', stats.size); res.setHeader('Cache-Control', 'private, no-store');
    return fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = new StorageService();
