import "dotenv/config";
import { replayDlq, TOPICS, type Topic } from "@ticketing/kafka-client";

const topics: string[] = Object.values(TOPICS);
const topic = process.argv[2];
const brokers = process.env.KAFKA_BROKERS;

if (!topic || !topics.includes(topic) || !brokers) {
  console.error(
    `Usage: KAFKA_BROKERS=<host:port> node dist/dlq-replay.js <${topics.join("|")}>`,
  );
  process.exitCode = 1;
} else {
  const result = await replayDlq(brokers.split(","), topic as Topic);
  console.log(`Done: replayed ${result.replayed}, skipped ${result.skipped}`);
}
