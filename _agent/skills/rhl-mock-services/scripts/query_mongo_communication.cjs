#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

function getMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const envPaths = [
    path.resolve(process.cwd(), "workspaces/backend-api/.env"),
    "/Users/joe/Projects/empo_health/env/.env.backend-api",
    path.resolve(process.cwd(), ".env"),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      const match = content.match(/^MONGODB_URI=(.*)$/m);
      if (match) return match[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return "mongodb://localhost:27017/empo";
}

async function main() {
  const mode = process.argv[2] || "recent-history";
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  const uri = getMongoUri();
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db();

    if (mode === "phone") {
      if (!arg1) {
        console.error("Usage: query_mongo_communication.cjs phone <phoneNumber>");
        process.exit(1);
      }
      const users = await db.collection("users").find({
        $or: [
          { "phoneNumber.value": arg1 },
          { "phoneNumber.value": `+${arg1.replace(/^\+/, "")}` },
          { "phoneNumber.value": arg1.replace(/^\+1/, "") },
        ],
      }).toArray();
      console.log(`Found ${users.length} user(s) matching phone ${arg1}:`);
      console.log(JSON.stringify(users.map((u) => ({
        id: u._id.toString(),
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phoneNumber?.value,
        roles: u.roles,
        careOrganizationId: u.careOrganizationId,
      })), null, 2));
    } else if (mode === "user") {
      if (!arg1) {
        console.error("Usage: query_mongo_communication.cjs user <userId>");
        process.exit(1);
      }
      let query;
      try {
        query = { _id: new ObjectId(arg1) };
      } catch {
        query = { _id: arg1 };
      }
      const user = await db.collection("users").findOne(query);
      console.log("User details:", JSON.stringify(user, null, 2));
    } else if (mode === "recent-history") {
      const limit = parseInt(arg1 || "5", 10);
      console.log(`Fetching last ${limit} communication histories...`);
      const histories = await db.collection("communicationhistories")
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      for (const h of histories) {
        console.log(JSON.stringify({
          id: h._id.toString(),
          type: h.type,
          patientId: h.patientId ? h.patientId.toString() : null,
          from: h.from ? h.from.toString() : null,
          to: h.to ? h.to.toString() : null,
          direction: h.direction,
          body: h.body,
          isRead: h.isRead,
          createdAt: h.createdAt,
        }, null, 2));
      }
    } else if (mode === "user-history") {
      if (!arg1) {
        console.error("Usage: query_mongo_communication.cjs user-history <patientId> [limit]");
        process.exit(1);
      }
      const limit = parseInt(arg2 || "10", 10);
      let pId;
      try {
        pId = new ObjectId(arg1);
      } catch {
        pId = arg1;
      }
      const histories = await db.collection("communicationhistories")
        .find({ patientId: pId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      console.log(`Found ${histories.length} communication history records for patient ${arg1}:`);
      for (const h of histories) {
        console.log(JSON.stringify({
          id: h._id.toString(),
          type: h.type,
          direction: h.direction,
          body: h.body,
          isRead: h.isRead,
          createdAt: h.createdAt,
        }, null, 2));
      }
    } else {
      console.error(`Unknown command: ${mode}. Available commands: phone, user, recent-history, user-history`);
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("MongoDB query error:", err);
  process.exit(1);
});
