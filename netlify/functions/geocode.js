// netlify/functions/geocode.js

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }
  
    try {
      const { lat, lon } = event.queryStringParameters;
  
      if (!lat || !lon) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing lat or lon parameter' })
        };
      }
  
      // Call Nominatim from server-side (no CORS issues)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        {
          headers: {
            'User-Agent': 'PhotoPortfolio/1.0',
            'Accept': 'application/json'
          }
        }
      );
  
      if (!response.ok) {
        throw new Error(`Nominatim error: ${response.status}`);
      }
  
      const data = await response.json();
      const address = data.address;
  
      // Build location string: "City, Country"
      const parts = [];
  
      if (address.city) parts.push(address.city);
      else if (address.town) parts.push(address.town);
      else if (address.village) parts.push(address.village);
      else if (address.county) parts.push(address.county);
      else if (address.state) parts.push(address.state);
  
      if (address.country) parts.push(address.country);
  
      const location = parts.join(', ') || null;
  
      return {
        statusCode: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
        },
        body: JSON.stringify({ location })
      };
    } catch (error) {
      console.error('Geocoding error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message })
      };
    }
  };