const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ygftopwtblcoxgzusywy.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnZnRvcHd0Ymxjb3hnenVzeXd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczOTQ2MzUxNCwiZXhwIjoyMDU1MDM5NTE0fQ.vBXN36i42RU9dz5Bkv7TF81Sp0Wxx0-M_QCYUt1t7TI'
);

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dgsr2qkwp';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Delete from Cloudinary
const deleteFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    const timestamp = Math.round(Date.now() / 1000);
    const signature = crypto
      .createHash('sha1')
      .update(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
      .digest('hex');

    const postData = new URLSearchParams({
      public_id: publicId,
      signature: signature,
      api_key: CLOUDINARY_API_KEY,
      timestamp: timestamp
    }).toString();

    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { id } = JSON.parse(event.body);

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Photo ID is required' })
      };
    }

    // Verify authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Get photo details from Supabase
    const { data: photo, error: fetchError } = await supabase
      .from('photos')
      .select('cloudinary_public_id')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Delete from Cloudinary if we have the credentials
    if (CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET && photo.cloudinary_public_id) {
      try {
        await deleteFromCloudinary(photo.cloudinary_public_id);
      } catch (cloudinaryError) {
        console.error('Cloudinary deletion failed:', cloudinaryError);
        // Continue anyway - at least delete from database
      }
    }

    // Delete from Supabase
    const { error: deleteError } = await supabase
      .from('photos')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Delete error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};