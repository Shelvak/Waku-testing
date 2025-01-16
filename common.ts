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

import { tcp } from "@libp2p/tcp";
// import { enrTree, wakuDnsDiscovery } from "@waku/dns-discovery";

export const CONTENT_TOPIC   = "/coffer/0.1/PLACEHOLDER/proto";
export const HANDSHAKE_TOPIC = CONTENT_TOPIC.replace('PLACEHOLDER', 'handshake');

export const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const to_bs58 = (pubKey) => {
  if (!pubKey) return 'unknown';

  if (pubKey instanceof Uint8Array) {
    return bytesToUtf8(pubKey);
  }

  return pubKey;
}


// Protobuf bytes => Uint8Array (browser) or Buffer (node)
// repeated indicates an array of bytes
export const ChatMessage = new protobuf.Type("ChatMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("state", 2, "string"))
  .add(new protobuf.Field("body", 3, "bytes"))
  .add(new protobuf.Field("replyTo", 4, "bytes"))
  .add(new protobuf.Field("pubKey", 5, "bytes"))
  .add(new protobuf.Field("signedBody", 6, "bytes"));

export const sendMsg = async ({
  node,
  topic,
  replyTo,
  state,
  pubKey,
  signedBody,
  body,
}: {
  node: any,
  topic: string,
  replyTo: string,
  state: string,
  pubKey?: string,
  signedBody?: string,
  body: object
}) => {
  console.log("sendMsg", {
    topic,
    timestamp: Date.now(),
    state,
    body,
    replyTo,
    pubKey,
    signedBody,
  })
  try {
  const protoMessage = ChatMessage.create({
    timestamp: Date.now(),
    body: utf8ToBytes(JSON.stringify(body)),
    replyTo: utf8ToBytes(replyTo),
    state,
    pubKey: pubKey ? utf8ToBytes(pubKey) : undefined,
    signedBody: signedBody ? utf8ToBytes(signedBody) : undefined,
  });

  await node.lightPush.send(
    createEncoder({contentTopic: topic}), // ephemeral: true to not store
    { payload: ChatMessage.encode(protoMessage).finish() }
  );

  console.log("Message sent!");
  } catch (e) {
    console.error('Error sending message:', e);
  }
}


export const subscribeTo = async (node, topic, fn) => {
  let error, subscription
  // @ts-ignore
  try {
    ({ error, subscription } = await node.filter.createSubscription({
      forceUseAllPeers: true,
      maxAttempts: 10,
      contentTopics: [topic] }));
  } catch (e) {
    console.error('Error creating subscription:', e);
    process.exit(1);
  }

  if (error) {
    console.error("Error creating subscription", error);
    process.exit(1);
  }

  await subscription.subscribe(
    [createDecoder(topic)],
    async (wakuMessage) => {
      try {
        const msg = ChatMessage.decode(wakuMessage.payload);

        msg.body = JSON.parse(bytesToUtf8(msg.body))

        if (msg.replyTo)
          msg.replyTo = bytesToUtf8(msg.replyTo);

        if (msg.state == 'Cypher') {
          console.log("pub key:", msg.pubKey, to_bs58(msg.pubKey))
        }

        console.log(`\n\n\n [${msg.state}] ${
          (new Date(parseInt(msg.timestamp))).toLocaleString()
        } [${to_bs58(msg.pubKey)}] # ${msg.body}\n\n\n`);

        await fn(node, topic, msg);
      } catch (e) {
        console.error('Error decoding message:', e);
      }
    }
  );

  // "Ensure" the subscription is ready
  for ( let i = 0; i < 20; i++ )  {
    try {
      await subscription.ping();
      break;
    } catch (e) {
      if (e instanceof Error && e.message.includes("peer has no subscriptions")) {
                  // Reinitiate the subscription if the ping fails
        return await subscribeTo(node, topic, fn);
      }
      console.log("Error pinging subscription " + i)
      await sleep(1000)
    }
  }

  return subscription;
}

const peers = [
  '/ip4/0.0.0.0/tcp/30304/p2p/16Uiu2HAm6Lp23yeP1fYmGrhLdKbVJknL3KLFkadoXcRov8ZR9KYn',
  // '/ip4/192.168.0.7/tcp/30304/p2p/16Uiu2HAm6Lp23yeP1fYmGrhLdKbVJknL3KLFkadoXcRov8ZR9KYn',
  // "/ip4/191.81.198.0/tcp/30304/p2p/16Uiu2HAmT3qYSsKRzAzAMcYJnmWgKhtVD8d26chNAS5soHBbxAro"
  // "/ip4/0.0.0.0/tcp/60002/ws/p2p/16Uiu2HAm6Lp23yeP1fYmGrhLdKbVJknL3KLFkadoXcRov8ZR9KYn",
]

export const startNode = async () => {
  const node = await createLightNode({
    libp2p: { transports: [tcp()] }
    // bootstrapPeers: peers,
    // peerDiscovery: [
    //   wakuDnsDiscovery(
    //     [enrTree["TEST"]],
    //     {
    //       store: 3,
    //       lightPush: 3,
    //       filter: 3,
    //     },
    //   ),
    // ],
    // defaultBootstrap: true
  });

  console.log("Dialing peers")
  for ( let i = 0; i < 5; i++ )  {
    try {
      await node.dial(peers[0]);
      break
    } catch (e) {
      console.log("Error dialing peer " + i, e)
      await sleep(1000)
    }
  }
  // const promises = peers.map(multiaddr => node.dial(multiaddr));
  console.log("All dial up")

  // await Promise.all(promises);
  console.log("Dial finished")

  await node.start();

  for ( let i = 0; i < 5; i++ )  {
    try {
      // last version
      await node.waitForPeers([Protocols.LightPush, Protocols.Filter], 5000);
      // await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter], 5000);
      if (node.isConnected())
        break
    } catch (e) {
      console.log("Error waiting for remote peer " + i, e)
      await sleep(1000)
    }
  }

  console.log("Connected =D")

  return node
}

export const randomTopic = () => CONTENT_TOPIC.replace('PLACEHOLDER', randomBytes(40).toString('hex'));
