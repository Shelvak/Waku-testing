import { randomBytes } from "node:crypto";
import protobuf from "protobufjs";
import {
  createLightNode,
  waitForRemotePeer,
  createDecoder,
  createEncoder,
  bytesToUtf8,
  utf8ToBytes,
  Protocols,
} from "@waku/sdk";

export const CONTENT_TOPIC   = "/coffer/0.1/PLACEHOLDER/proto";
export const HANDSHAKE_TOPIC = CONTENT_TOPIC.replace('PLACEHOLDER', 'handshake');

export const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Protobuf bytes => Uint8Array (browser) or Buffer (node)
// repeated indicates an array of bytes
export const ChatMessage = new protobuf.Type("ChatMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("state", 2, "string"))
  .add(new protobuf.Field("text", 3, "bytes", "repeated"))
  .add(new protobuf.Field("replyTo", 4, "bytes"));

export const sendMsg = async (node, topic, replyTo, state, ...msg) => {
  console.log("sendmsg", {
    topic,
    timestamp: Date.now(),
    text: msg.flat(Infinity).map(utf8ToBytes),
    state,
    replyTo,
  })
  const protoMessage = ChatMessage.create({
    timestamp: Date.now(),
    text: msg.flat(Infinity).map(utf8ToBytes),
    state,
    replyTo: utf8ToBytes(replyTo),
  });

  await node.lightPush.send(
    createEncoder({contentTopic: topic}),
    { payload: ChatMessage.encode(protoMessage).finish() }
  );

  console.log("Message sent!");
}

export const subscribeTo = async (node, topic, fn) => {
  // @ts-ignore
  const { error, subscription } = await node.filter.createSubscription({ contentTopics: [topic] });

  if (error) {
    console.error("Error creating subscription", error);
    process.exit(1);
  }

  await subscription.subscribe(
    [createDecoder(topic)],
    async (wakuMessage) => {
      const msg = ChatMessage.decode(wakuMessage.payload);

      msg.text = msg.text.map(bytesToUtf8);
      if (msg.replyTo)
        msg.replyTo = bytesToUtf8(msg.replyTo);

      console.log(`\n\n\n [${msg.state}] ${
        (new Date(parseInt(msg.timestamp))).toLocaleString()
      } # ${msg.text}\n\n\n`);

      await fn(node, topic, msg);
    }
  );

  // "Ensure" the subscription is ready
  for ( let i = 0; i < 20; i++ )  {
    try {
      await subscription.ping();
      break;
    } catch (e) {
      console.log("Error pinging subscription " + i)
      await sleep(500)
    }
  }

  return subscription;
}

export const startNode = async () => {
  const node = await createLightNode({ defaultBootstrap: true });

  await node.start();

  for ( let i = 0; i < 20; i++ )  {
    try {
      await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter], 2000);
      if (node.isConnected())
        break
    } catch (e) {
      console.log("Error waiting for remote peer " + i)
      await sleep(500)
    }
  }

  console.log("Connected =D")

  return node
}

export const randomTopic = () => CONTENT_TOPIC.replace('PLACEHOLDER', randomBytes(40).toString('hex'));
