/**
 * Test contact-messages API endpoint to capture the actual error
 */

const BASE_URL = 'http://localhost:3000';

async function testContactMessages() {
  console.log('Testing /api/admin/contact-messages endpoint...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/admin/contact-messages`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('\nResponse body:');
    console.log(text);
    
    try {
      const json = JSON.parse(text);
      console.log('\nParsed JSON:');
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('\nResponse is not JSON');
    }
    
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

testContactMessages();
