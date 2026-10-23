const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');
const storageService = require('../src/services/storage.service');

test('Bill Upload & Google Cloud Storage Service Tests', async (t) => {
  let authCookie;
  let createdAssetId;

  // Valid 1x1 transparent PNG pixel base64
  const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Valid 1x1 JPEG pixel base64 (FF D8 FF ...)
  const sampleJpgBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  await t.test('Setup: authenticate administrator', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'itadmin',
        password: 'AdminPassword123!'
      });

    assert.strictEqual(res.statusCode, 200);
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies, 'Must issue session cookie');
    authCookie = cookies[0];
  });

  await t.test('1. POST /api/assets/upload-bill rejects unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/assets/upload-bill')
      .send({ image: samplePngBase64 });

    assert.strictEqual(res.statusCode, 401);
  });

  await t.test('2. POST /api/assets/upload-bill rejects missing image data with 400', async () => {
    const res = await request(app)
      .post('/api/assets/upload-bill')
      .set('Cookie', [authCookie])
      .send({});

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  await t.test('3. POST /api/assets/upload-bill uploads valid PNG bill and returns metadata', async () => {
    const res = await request(app)
      .post('/api/assets/upload-bill')
      .set('Cookie', [authCookie])
      .send({
        image: samplePngBase64,
        fileName: 'dell_laptop_invoice.png',
        mimeType: 'image/png'
      });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.url, 'Must return retrieval URL');
    assert.strictEqual(res.body.data.mimeType, 'image/png');
    assert.strictEqual(res.body.data.originalName, 'dell_laptop_invoice.png');
    assert.ok(res.body.data.objectName.startsWith('bills/'), 'Object name must start with bills/');
  });

  await t.test('4. POST /api/assets/upload-bill uploads valid JPEG bill and detects MIME accurately', async () => {
    const res = await request(app)
      .post('/api/assets/upload-bill')
      .set('Cookie', [authCookie])
      .send({
        image: sampleJpgBase64,
        fileName: 'vendor_bill.jpg'
      });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.mimeType, 'image/jpeg');
    assert.ok(res.body.data.fileName.endsWith('.jpg'));
  });

  await t.test('5. Rejects unsupported file types and invalid magic numbers (PDF/CSV/Text)', async () => {
    // Fake base64 text file content "This is a fake CSV or document"
    const fakeTextBase64 = Buffer.from('This is a text document, not an image.').toString('base64');

    const res = await request(app)
      .post('/api/assets/upload-bill')
      .set('Cookie', [authCookie])
      .send({
        image: fakeTextBase64,
        fileName: 'document.pdf'
      });

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes('JPEG, PNG, or WebP'));
  });

  await t.test('6. Rejects oversized uploads exceeding configured limit', async () => {
    // Override max upload bytes to small threshold for test (sample PNG buffer is ~68 bytes)
    const oldLimit = process.env.GCS_MAX_UPLOAD_BYTES;
    process.env.GCS_MAX_UPLOAD_BYTES = '50'; // 50 bytes limit

    try {
      const res = await request(app)
        .post('/api/assets/upload-bill')
        .set('Cookie', [authCookie])
        .send({
          image: samplePngBase64,
          fileName: 'oversized_bill.png'
        });

      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('exceeds maximum allowed limit'));
    } finally {
      if (oldLimit !== undefined) {
        process.env.GCS_MAX_UPLOAD_BYTES = oldLimit;
      } else {
        delete process.env.GCS_MAX_UPLOAD_BYTES;
      }
    }
  });

  await t.test('7. POST /api/assets creates an asset with bill image and GET /api/assets/:id returns bill details', async () => {
    const uploadRes = await request(app)
      .post('/api/assets/upload-bill')
      .set('Cookie', [authCookie])
      .send({
        image: samplePngBase64,
        fileName: 'macbook_apple_invoice.png',
        mimeType: 'image/png'
      });

    assert.strictEqual(uploadRes.statusCode, 200);
    const billUrl = uploadRes.body.data.url;
    const billName = uploadRes.body.data.objectName;

    const uniqueSuffix = Date.now() + '_' + Math.floor(Math.random() * 10000);
    const createRes = await request(app)
      .post('/api/assets')
      .set('Cookie', [authCookie])
      .send({
        asset_tag: `AST-BILL-${uniqueSuffix}`,
        serial_number: `SN-BILL-${uniqueSuffix}`,
        name: 'MacBook Pro 16 M3 Max',
        category: 'LAPTOP',
        manufacturer: 'Apple',
        model: 'MacBook Pro 16',
        purchase_date: '2026-04-10',
        purchase_cost: 3499.00,
        warranty_expiry: '2029-04-10',
        notes: 'Executive laptop with original procurement bill',
        bill_image_url: billUrl,
        bill_image_name: billName
      });

    assert.strictEqual(createRes.statusCode, 201);
    createdAssetId = createRes.body.data.asset.id;
    assert.strictEqual(createRes.body.data.asset.bill_image_url, billUrl);
    assert.strictEqual(createRes.body.data.asset.bill_image_name, billName);

    // Verify GET /api/assets/:id
    const getRes = await request(app)
      .get(`/api/assets/${createdAssetId}`)
      .set('Cookie', [authCookie]);

    assert.strictEqual(getRes.statusCode, 200);
    assert.strictEqual(getRes.body.data.asset.bill_image_url, billUrl);
    assert.strictEqual(getRes.body.data.asset.bill_image_name, billName);
  });

  await t.test('8. GET /api/assets/bills/:fileName streams private bill image with auth', async () => {
    const uploadRes = await request(app)
      .post('/api/assets/upload-bill')
      .set('Cookie', [authCookie])
      .send({
        image: samplePngBase64,
        fileName: 'stream_test.png'
      });

    const fileNameOnly = uploadRes.body.data.fileName;

    // Unauthenticated access must be rejected with 401
    const unauthRes = await request(app)
      .get(`/api/assets/bills/${fileNameOnly}`);
    assert.strictEqual(unauthRes.statusCode, 401);

    // Authenticated access must stream image successfully
    const authRes = await request(app)
      .get(`/api/assets/bills/${fileNameOnly}`)
      .set('Cookie', [authCookie]);

    assert.strictEqual(authRes.statusCode, 200);
    assert.ok(authRes.headers['content-type'].includes('image/png'));
  });

  await t.test('9. GET /api/assets/bills/:fileName/signed-url returns short-lived signed URL', async () => {
    const uploadRes = await request(app)
      .post('/api/assets/upload-bill')
      .set('Cookie', [authCookie])
      .send({
        image: samplePngBase64,
        fileName: 'signed_test.png'
      });

    const fileNameOnly = uploadRes.body.data.fileName;

    const res = await request(app)
      .get(`/api/assets/bills/${fileNameOnly}/signed-url`)
      .set('Cookie', [authCookie]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.signedUrl, 'Must return signed URL');
    assert.strictEqual(res.body.data.expiresInMinutes, 15);
  });

  await t.test('10. Path traversal in bill object name is rejected with 400', async () => {
    assert.throws(() => {
      storageService.sanitizeObjectName('bills/../../../etc/passwd');
    }, /Invalid or unauthorized/);

    assert.throws(() => {
      storageService.sanitizeObjectName('/absolute/path/file.png');
    }, /Invalid or unauthorized/);
  });

  await t.test('11. Storage metadata retrieval and safe deletion', async () => {
    const upload = await storageService.uploadBillImage({
      base64Data: samplePngBase64,
      fileName: 'metadata_test.png'
    });

    const meta = await storageService.getBillImageMetadata(upload.objectName);
    assert.ok(meta.sizeBytes > 0);
    assert.ok(meta.updated);

    const delResult = await storageService.deleteBillImage(upload.objectName);
    assert.strictEqual(delResult.deleted, true);
  });

  await t.test('Teardown: clean up test created asset', async () => {
    if (createdAssetId) {
      const delRes = await request(app)
        .delete(`/api/assets/${createdAssetId}`)
        .set('Cookie', [authCookie]);
      assert.strictEqual(delRes.statusCode, 200);
    }
  });
});
