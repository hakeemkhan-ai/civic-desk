import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { connect, collections } from '../server/db.js';
import { newComplaint, digest } from '../server/complaints.js';
import { fixtureFields, hyderabadFixtures as fixtures } from '../server/demo-fixtures.js';
import { departments, type Status } from '../shared/domain.js';
if (process.env.NODE_ENV === 'production' || process.env.DEMO_ACCOUNTS !== 'true')
  throw new Error('Seed requires non-production NODE_ENV and DEMO_ACCOUNTS=true');
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Set DEMO_PASSWORD to at least 12 characters.');
const { db, client } = await connect();
try {
  const c = collections(db),
    hash = await bcrypt.hash(password, 12);
  for (const [role, name] of [
    ['resident', 'Alex Morgan'],
    ['staff', 'Sam Rivera'],
  ] as const)
    await c.users.updateOne(
      { email: `${role}@brookfield.example` },
      {
        $setOnInsert: {
          _id: randomUUID(),
          name,
          email: `${role}@brookfield.example`,
          passwordHash: hash,
          role,
        },
      },
      { upsert: true },
    );
  const resident = (await c.users.findOne({ email: 'resident@brookfield.example' }))!;

  for (const [i, [, description, category, , , , status]] of fixtures.entries()) {
    const { content, location } = fixtureFields(i);
    const original = { notes: description, location, observedAt: null };
    const key = `seed-v1-${i}`;
    const complaint = newComplaint(
      resident._id,
      key,
      digest(content),
      original,
      content,
      null,
      null,
    );
    complaint.synthetic = true;
    complaint.createdAt = new Date(Date.UTC(2026, 9, 12, 10) - i * 86400000).toISOString();
    complaint.updatedAt = complaint.createdAt;
    complaint.timeline[0].at = complaint.createdAt;
    const path: Status[] = ['submitted', 'under review', 'assigned', 'in progress', 'resolved'];
    for (const [n, s] of path.slice(1, path.indexOf(status) + 1).entries())
      complaint.timeline.push({
        id: randomUUID(),
        at: new Date(Date.parse(complaint.createdAt) + (n + 1) * 3600000).toISOString(),
        kind: 'status',
        actorRole: 'staff',
        status: s,
        note: `Synthetic demonstration: ${s === 'resolved' ? 'staff recorded completion' : `report moved to ${s}`}.`,
      });
    complaint.status = status;
    if (path.indexOf(status) >= 2) {
      complaint.department = departments[category];
      complaint.reviewed = true;
      complaint.timeline.splice(2, 0, {
        id: randomUUID(),
        at: new Date(Date.parse(complaint.createdAt) + 90 * 60000).toISOString(),
        kind: 'review',
        actorRole: 'staff',
        status: 'under review',
        note: 'Synthetic demonstration: category and service team confirmed.',
        decision: { category, department: departments[category] },
      });
    }
    complaint.updatedAt = complaint.timeline.at(-1)!.at;
    await c.complaints.updateOne(
      { ownerId: resident._id, submissionKey: key },
      { $setOnInsert: complaint },
      { upsert: true },
    );
  }
  console.log('Seed complete (additive and repeatable). Synthetic Hyderabad reports are labeled.');
  console.log(
    'Accounts: resident@brookfield.example and staff@brookfield.example. Password: your DEMO_PASSWORD value. Existing accounts are unchanged.',
  );
} finally {
  await client.close();
}
