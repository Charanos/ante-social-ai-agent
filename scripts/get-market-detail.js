const axios = require('axios');

async function getMarketDetail() {
  const id = '69ba15d5dfb295d51cdfe657';
  try {
    const response = await axios.get(`http://localhost:3003/markets/${id}`);
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

getMarketDetail();
