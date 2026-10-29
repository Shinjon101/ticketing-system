import { Kafka, logLevel } from "kafkajs";
import { DlqMessageSchema } from "./scehmas";
import { toDlqTopic, type Topic } from "./topics";

const REPLAY_GROUP_ID = "dlq-replay";
const IDLE_TIMEOUT_MS = 10_000;

export interface ReplayResult {
  replayed: number;
  skipped: number;
}

const parseDlqMessage = (value: Buffer | null) => {
  try {
    return DlqMessageSchema.safeParse(JSON.parse(value?.toString() ?? ""));
  } catch {
    return { success: false as const };
  }
};

export const replayDlq = async (
  brokers: string[],
  topic: Topic,
): Promise<ReplayResult> => {
  const kafka = new Kafka({
    clientId: "dlq-replay",
    brokers,
    logLevel: logLevel.WARN,
  });
  const dlqTopic = toDlqTopic(topic);
  const result: ReplayResult = { replayed: 0, skipped: 0 };

  const admin = kafka.admin();
  await admin.connect();
  const endOffsets = new Map(
    (await admin.fetchTopicOffsets(dlqTopic)).map((p) => [
      p.partition,
      Number(p.high),
    ]),
  );
  await admin.disconnect();

  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: REPLAY_GROUP_ID });
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: dlqTopic, fromBeginning: true });

  let idleTimer: NodeJS.Timeout | undefined;
  const idle = new Promise<void>((resolve) => {
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(resolve, IDLE_TIMEOUT_MS);
    };
    resetIdleTimer();

    void consumer.run({
      autoCommit: false,
      eachMessage: async ({ partition, message }) => {
        const offset = Number(message.offset);
        if (offset >= (endOffsets.get(partition) ?? 0)) return;
        resetIdleTimer();

        const parsed = parseDlqMessage(message.value);
        if (parsed.success) {
          await producer.send({
            topic,
            messages: [
              {
                key: parsed.data.originalKey ?? null,
                value: parsed.data.originalValue,
              },
            ],
          });
          result.replayed += 1;
          console.log(
            `replayed p${partition}@${offset} key=${parsed.data.originalKey ?? "-"} error=${JSON.stringify(parsed.data.error)}`,
          );
        } else {
          result.skipped += 1;
          console.log(`skipped p${partition}@${offset}: not a DLQ message`);
        }

        await consumer.commitOffsets([
          { topic: dlqTopic, partition, offset: String(offset + 1) },
        ]);
      },
    });
  });

  await idle;
  await consumer.disconnect();
  await producer.disconnect();
  return result;
};
