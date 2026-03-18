const axios = require('axios');

async function checkNativeMarkets() {
  try {
    const response = await axios.get('http://localhost:3003/markets?limit=100');
    const markets = response.data.data;
    
    const native = markets.filter(m => m.externalSource !== 'polymarket');
    
    console.log(`Found ${native.length} native markets out of ${markets.length} fetched:`);
    native.forEach(m => {
      console.log(`- ID: ${m._id}, Title: ${m.title}, Status: ${m.status}, EndsAt: ${m.endsAt}, Tier: ${m.minimumTier}, Category: ${m.category}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkNativeMarkets();
