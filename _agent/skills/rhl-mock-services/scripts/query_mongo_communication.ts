#!/usr/bin/env bun
/**
 * query_mongo_communication.ts
 *
 * Query MongoDB for user profiles, phone lookups, and recent communication histories.
 */

import { Command } from 'commander';
import { MongoClient, ObjectId } from 'mongodb';

export async function resolveMongoUri(): Promise<string> {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

  const candidatePaths = [
    'workspaces/backend-api/.env',
    '/Users/joe/Projects/empo_health/env/.env.backend-api',
    '.env',
  ];

  for (const p of candidatePaths) {
    const file = Bun.file(p);
    if (await file.exists()) {
      const content = await file.text();
      const match = /^MONGODB_URI=(.*)$/m.exec(content);
      if (match?.[1]) {
        return match[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }

  return 'mongodb://localhost:27017/empo';
}

export async function runCli(): Promise<void> {
  const defaultUri = await resolveMongoUri();

  const program = new Command()
    .name('query_mongo_communication')
    .description('Query MongoDB communication records, users, and message history.')
    .option('--uri <mongo_uri>', 'MongoDB connection URI', defaultUri)
    .addHelpText(
      'after',
      `
Subcommands / Modes:
  phone <phoneNumber>         Find users matching a specific phone number
  user <userId>               Fetch full profile for a given user ID
  recent-history [limit]      List most recent communication history entries (default: 5)
  user-history <patientId>    List message histories for a specific patient ID (default: 10)

Examples:
  $ bun run query_mongo_communication.ts phone "+14155295117"
  $ bun run query_mongo_communication.ts recent-history 10
  $ bun run query_mongo_communication.ts user-history 64b8f0... 5
`,
    );

  program
    .command('phone <phoneNumber>')
    .description('Find users by phone number')
    .action(async (phoneNumber: string) => {
      const opts = program.opts<{ uri: string }>();
      const client = new MongoClient(opts.uri);
      try {
        await client.connect();
        const db = client.db();
        const cleanPhone = phoneNumber.trim();
        const users = await db
          .collection('users')
          .find({
            $or: [
              { 'phoneNumber.value': cleanPhone },
              { 'phoneNumber.value': `+${cleanPhone.replace(/^\+/, '')}` },
              { 'phoneNumber.value': cleanPhone.replace(/^\+1/, '') },
            ],
          })
          .toArray();

        console.log(`Found ${users.length} matching user(s):`);
        console.log(
          JSON.stringify(
            users.map((u) => ({
              id: u._id.toString(),
              firstName: u.firstName,
              lastName: u.lastName,
              phone: u.phoneNumber?.value,
              roles: u.roles,
              careOrganizationId: u.careOrganizationId,
            })),
            null,
            2,
          ),
        );
      } finally {
        await client.close();
      }
    });

  program
    .command('user <userId>')
    .description('Fetch user details by ID')
    .action(async (userId: string) => {
      const opts = program.opts<{ uri: string }>();
      const client = new MongoClient(opts.uri);
      try {
        await client.connect();
        const db = client.db();
        let query: Record<string, unknown>;
        try {
          query = { _id: new ObjectId(userId) };
        } catch {
          query = { _id: userId };
        }
        const user = await db.collection('users').findOne(query);
        console.log('User details:', JSON.stringify(user, null, 2));
      } finally {
        await client.close();
      }
    });

  program
    .command('recent-history [limit]')
    .description('Fetch most recent communication history records')
    .action(async (limitStr?: string) => {
      const limit = Number.parseInt(limitStr || '5', 10);
      const opts = program.opts<{ uri: string }>();
      const client = new MongoClient(opts.uri);
      try {
        await client.connect();
        const db = client.db();
        console.log(`Fetching last ${limit} communication histories...`);
        const histories = await db
          .collection('communicationhistories')
          .find({})
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();

        for (const h of histories) {
          console.log(
            JSON.stringify(
              {
                id: h._id.toString(),
                type: h.type,
                patientId: h.patientId ? h.patientId.toString() : null,
                from: h.from ? h.from.toString() : null,
                to: h.to ? h.to.toString() : null,
                direction: h.direction,
                body: h.body,
                isRead: h.isRead,
                createdAt: h.createdAt,
              },
              null,
              2,
            ),
          );
        }
      } finally {
        await client.close();
      }
    });

  program
    .command('user-history <patientId> [limit]')
    .description('Fetch communication history for a specific patient')
    .action(async (patientId: string, limitStr?: string) => {
      const limit = Number.parseInt(limitStr || '10', 10);
      const opts = program.opts<{ uri: string }>();
      const client = new MongoClient(opts.uri);
      try {
        await client.connect();
        const db = client.db();
        let pId: ObjectId | string;
        try {
          pId = new ObjectId(patientId);
        } catch {
          pId = patientId;
        }

        const histories = await db
          .collection('communicationhistories')
          .find({ patientId: pId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();

        console.log(`Found ${histories.length} message(s) for patient ${patientId}:`);
        for (const h of histories) {
          console.log(
            JSON.stringify(
              {
                id: h._id.toString(),
                type: h.type,
                direction: h.direction,
                body: h.body,
                isRead: h.isRead,
                createdAt: h.createdAt,
              },
              null,
              2,
            ),
          );
        }
      } finally {
        await client.close();
      }
    });

  await program.parseAsync();
}

if (import.meta.main) {
  try {
    await runCli();
  } catch (err: unknown) {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
