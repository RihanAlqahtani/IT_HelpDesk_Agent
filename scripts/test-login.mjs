#!/usr/bin/env node
/**
 * Test login to verify role is returned correctly
 */

const API_URL = 'http://localhost:3001';

async function testLogin() {
  console.log('Testing IT Admin login...\n');

  try {
    const response = await fetch(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'itadmin@test.local',
        password: 'TestPassword123!',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Login failed:', data);
      return;
    }

    console.log('Login successful!');
    console.log('User:', JSON.stringify(data.user, null, 2));
    console.log('\nRole returned:', data.user?.role);

    // Now test the /api/auth/me endpoint
    console.log('\n--- Testing /api/auth/me endpoint ---');
    const meResponse = await fetch(`${API_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${data.session.accessToken}`,
      },
    });

    const meData = await meResponse.json();
    console.log('Profile response:', JSON.stringify(meData, null, 2));

    // Now test tickets endpoint
    console.log('\n--- Testing /api/tickets endpoint ---');
    const ticketsResponse = await fetch(`${API_URL}/api/tickets`, {
      headers: {
        'Authorization': `Bearer ${data.session.accessToken}`,
      },
    });

    const ticketsData = await ticketsResponse.json();
    console.log('Tickets response status:', ticketsResponse.status);
    console.log('Number of tickets:', ticketsData.tickets?.length ?? 0);
    if (ticketsData.error) {
      console.error('Tickets error:', ticketsData);
    }

    // Test stats endpoint
    console.log('\n--- Testing /api/tickets/stats endpoint ---');
    const statsResponse = await fetch(`${API_URL}/api/tickets/stats`, {
      headers: {
        'Authorization': `Bearer ${data.session.accessToken}`,
      },
    });

    const statsData = await statsResponse.json();
    console.log('Stats response status:', statsResponse.status);
    if (statsResponse.ok) {
      console.log('Stats:', JSON.stringify(statsData, null, 2));
    } else {
      console.error('Stats error:', statsData);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLogin();
