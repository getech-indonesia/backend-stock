import 'dotenv/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function testS3Upload() {
  const endpoint = process.env.S3_ENDPOINT_URL;
  const bucket = process.env.S3_BUCKET_NAME;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const region = process.env.S3_REGION ?? 'us-east-1';

  console.log('--- S3 Configurations ---');
  console.log('Endpoint URL:', endpoint);
  console.log('Bucket Name :', bucket);
  console.log('Region      :', region);
  console.log('Access Key  :', accessKey ? '*** Present ***' : '*** MISSING ***');
  console.log('Secret Key  :', secretKey ? '*** Present ***' : '*** MISSING ***');
  console.log('-------------------------');

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    console.error('Error: S3 configurations are incomplete in environment variables.');
    process.exit(1);
  }

  try {
    const s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });

    const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const key = `test/s3-upload-test-${uniqueId}.txt`;
    const bodyContent = `Hello! This is a test file uploaded to S3 at ${new Date().toISOString()}.`;

    console.log(`\nUploading file to S3 as key: "${key}"...`);

    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(bodyContent),
      ContentType: 'text/plain',
    });

    await s3Client.send(putCommand);
    console.log('✅ Upload successful.');

    console.log('\nGenerating signed URL (expires in 10 minutes)...');
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
      { expiresIn: 600 }
    );

    console.log('✅ Signed URL successfully generated:');
    console.log(signedUrl);

  } catch (error: any) {
    console.error('❌ Error during S3 operation:', error.message || error);
  }
}

testS3Upload();
