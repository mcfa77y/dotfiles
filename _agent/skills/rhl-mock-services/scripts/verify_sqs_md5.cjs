#!/usr/bin/env node
const http = require("http");
const { SQSClient, ReceiveMessageCommand } = require("@aws-sdk/client-sqs");

const mockPort = parseInt(process.env.MOCK_PORT || "3001", 10);
const from = process.env.FROM_NUMBER || "+14155295117";
const to = process.env.TO_NUMBER || "+18884613835";
const body = process.env.MESSAGE_BODY || "test md5 verification";

async function postJson(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: "localhost",
        port: mockPort,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(raw);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log(`Triggering inbound SMS on mock-services port ${mockPort}...`);
  const triggerRes = await postJson("/mock-admin/triggers/sqs/inbound-sms", { from, to, body });
  console.log("Trigger res:", triggerRes);

  console.log("Calling ReceiveMessageCommand with official AWS SQS SDK...");
  const client = new SQSClient({
    region: "us-east-1",
    endpoint: `http://localhost:${mockPort}/sqs`,
    credentials: { accessKeyId: "mock", secretAccessKey: "mock" },
  });

  const res = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: "https://sqs.us-east-1.amazonaws.com/433752464159/TwilioSQSQueue",
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
    })
  );

  console.log("ReceiveMessage SUCCESS! Validated MD5 checksum without error.");
  console.log("Messages received:", res.Messages);
}

main().catch((err) => {
  console.error("ReceiveMessage FAILED:", err);
  process.exit(1);
});
