#!/usr/bin/env node
/**
 * Test ticket detail and conversation history access
 */

const API_URL = 'http://localhost:3001';

async function testTicketDetail() {
  console.log('Testing IT Admin ticket detail access...\n');

  try {
    // 1. Login as IT Admin
    const loginResponse = await fetch(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'itadmin@test.local',
        password: 'TestPassword123!',
      }),
    });

    const loginData = await loginResponse.json();
    if (!loginResponse.ok) {
      console.error('Login failed:', loginData);
      return;
    }

    const token = loginData.session.accessToken;
    console.log('Logged in as:', loginData.user.email, 'Role:', loginData.user.role);

    // 2. Get list of tickets
    const ticketsResponse = await fetch(`${API_URL}/api/tickets`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const ticketsData = await ticketsResponse.json();
    console.log('\nTickets found:', ticketsData.tickets?.length || 0);

    if (!ticketsData.tickets?.length) {
      console.log('No tickets to test');
      return;
    }

    // 3. Test getting ticket details for first ticket
    const ticket = ticketsData.tickets[0];
    console.log('\n--- Testing Ticket #' + ticket.ticketNumber + ' ---');
    console.log('Subject:', ticket.subject);
    console.log('Status:', ticket.status);

    // Get ticket details (IT staff endpoint)
    console.log('\nFetching ticket details...');
    const detailsResponse = await fetch(`${API_URL}/api/tickets/${ticket.id}/details`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (detailsResponse.ok) {
      const details = await detailsResponse.json();
      console.log('Ticket details: OK');
      console.log('  User:', details.user?.fullName || 'N/A');
    } else {
      const error = await detailsResponse.json();
      console.error('Ticket details FAILED:', detailsResponse.status, error);
    }

    // Get conversation history
    console.log('\nFetching conversation history...');
    const historyResponse = await fetch(`${API_URL}/api/agent/history/${ticket.id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (historyResponse.ok) {
      const history = await historyResponse.json();
      console.log('Conversation history: OK');
      console.log('  Messages:', history.messages?.length || 0);
      if (history.messages?.length > 0) {
        console.log('  First message role:', history.messages[0].role);
        console.log('  First message preview:', history.messages[0].content?.substring(0, 50) + '...');
      }
    } else {
      const error = await historyResponse.json();
      console.error('Conversation history FAILED:', historyResponse.status, error);
    }

    // Get interaction summary
    console.log('\nFetching interaction summary...');
    const summaryResponse = await fetch(`${API_URL}/api/agent/summary/${ticket.id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      console.log('Interaction summary: OK');
      console.log('  Total messages:', summary.totalMessages);
      console.log('  User messages:', summary.userMessages);
      console.log('  Agent messages:', summary.agentMessages);
      console.log('  Last decision:', summary.lastDecision);
    } else {
      const error = await summaryResponse.json();
      console.error('Interaction summary FAILED:', summaryResponse.status, error);
    }

    console.log('\n--- All API tests completed ---');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testTicketDetail();
