import { z } from 'zod';
import { connect } from '../server/db.js';
import { issueInvitation } from '../server/invitations.js';

const email = z.string().trim().email().max(254).parse(process.argv[2]);
const { db, client } = await connect();
try {
  const token = await issueInvitation(db, email);
  // Deliberate operator output: deliver privately to the address owner, never log in CI.
  console.log(`Invitation code (expires in 24 hours): ${token}`);
} finally {
  await client.close();
}
