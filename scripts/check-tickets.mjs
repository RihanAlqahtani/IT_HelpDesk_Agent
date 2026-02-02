#!/usr/bin/env node
/**
 * Check tickets and IT admin access
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('Checking tickets...\n');

  // Check tickets
  const { data: tickets, error: ticketErr } = await supabase
    .from('it_tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (ticketErr) {
    console.error('Error fetching tickets:', ticketErr);
  } else {
    console.log('Tickets in system:', tickets?.length || 0);
    if (tickets && tickets.length > 0) {
      for (const t of tickets) {
        console.log(`  #${t.ticket_number}: ${t.subject} [${t.status}]`);
      }
    } else {
      console.log('  No tickets found');
    }
  }

  // Check IT staff
  console.log('\nIT Staff users:');
  const { data: itRole } = await supabase
    .from('it_roles')
    .select('id')
    .eq('name', 'it_admin')
    .single();

  if (itRole) {
    const { data: admins } = await supabase
      .from('it_users')
      .select('email')
      .eq('role_id', itRole.id);

    for (const a of admins || []) {
      console.log(`  ${a.email}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
