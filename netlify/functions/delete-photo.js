const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ygftopwtblcoxgzusywy.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'sb_service_dROTCxmlboYY-oj5UjwmPQ_KbP0MdlS'
);

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

    const { error } = await supabase
      .from('photos')
      .delete()
      .eq('id', id);

    if (error) throw error;

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
