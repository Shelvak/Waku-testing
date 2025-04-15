import fs from "fs";
import { randomBytes } from "node:crypto";
import protobuf from "protobufjs";
import {
  createLightNode,
  // waitForRemotePeer,
  // createDecoder,
  // createEncoder,
  bytesToUtf8,
  utf8ToBytes,
  Protocols,
  LightNode,
  SubscribeResult,
} from "@waku/sdk";
import { createEncoder, createDecoder } from "@waku/message-encryption/ecies";
import { keccak256 } from "@waku/message-encryption/crypto";
import { bytesToHex, hexToBytes } from "@waku/utils/bytes";

import { wakuPeerExchangeDiscovery } from "@waku/discovery";
import { derivePubsubTopicsFromNetworkConfig } from "@waku/utils"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

import { tcp } from "@libp2p/tcp";
// import { enrTree, wakuDnsDiscovery } from "@waku/dns-discovery";

export const CONTENT_TOPIC   = "/coffer/0.1/PLACEHOLDER/proto";
export const HANDSHAKE_TOPIC = CONTENT_TOPIC.replace('PLACEHOLDER', 'handshake');

export const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const networkConfig = {
  clusterId: 42,
  shards: [0],
  // peerExchange: true,
}


const to_bs58 = (pubKey) => {
  if (!pubKey) return 'unknown';

  if (pubKey instanceof Uint8Array) {
    return bytesToUtf8(pubKey);
  }

  return pubKey;
}

let privateKey = ''
try {
  privateKey = process.env.PRIVATE_KEY || fs.readFileSync('./.testPrivateKey', 'utf8');
} catch (_e) {
  privateKey = generatePrivateKey();
  fs.writeFileSync('./.testPrivateKey', privateKey, 'utf8');
}
const account = privateKeyToAccount(privateKey);
const eciesPrivateKey = hexToBytes(privateKey);


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
  // pubKey,
  signedBody,
  body,
}: {
  node: any,
  topic: string,
  replyTo: string,
  state: string,
  // pubKey: string,
  signedBody?: string,
  body: object
}) => {
  console.log("sendMsg", {
    topic,
    timestamp: Date.now(),
    state,
    body,
    replyTo,
    // pubKey,
    signedBody,
  })

  const pubKey = account.publicKey;
  try {
    const ts = Date.now();
    const protoMessage = ChatMessage.create({
      timestamp: ts,
      body: utf8ToBytes(JSON.stringify(body)),
      replyTo: utf8ToBytes(replyTo),
      state,
      pubKey: pubKey ? utf8ToBytes(pubKey) : undefined,
      signedBody: signedBody ? utf8ToBytes(signedBody) : undefined,
    });

    await node.lightPush.send(
      createEncoder({
        contentTopic: topic,
        publicKey: hexToBytes(pubKey), // Public key should be 65bytes secp256k1.publicKey
        pubsubTopicShardInfo: { clusterId: networkConfig.clusterId, shard: networkConfig.shards[0] },
        ephemeral: true
      }),
      { payload: ChatMessage.encode(protoMessage).finish(), timestamp: ts }
    );

    console.log("Message sent!");
  } catch (e) {
    console.error('Error sending message:', e);
  }
}

const msgHashes = []
const checkDuplicate = (wakuMessage: any, msg: any): boolean => {
  const input = new Uint8Array([
    // Filter by topic
    ...utf8ToBytes(wakuMessage.contentTopic),
    // Decrypted body (already in uint8array)
    ...msg.body,
    // Decrypted timestamp, because the wakuMessage.timestamp changes
    ...utf8ToBytes(msg.timestamp.toString()),
  ])
  const hash = bytesToHex(keccak256(input))

  if (msgHashes.indexOf(hash) >= 0) {
    console.debug("Message already delivered", hash)
    console.debug(`Waku ts: ${wakuMessage.timestamp.getTime()} Msg ts: ${msg.timestamp}`);
    return true
  }
  if (msgHashes.length > 2000) {
    console.debug("Dropping old messages from hash cache")
    msgHashes.slice(hash.length - 500, hash.length)
  }
  msgHashes.push(hash)
  return false
}


export const subscribeTo = async (node: LightNode, topic, fn) => {
  let error, subscription
  // @ts-ignore
  try {
    const subResult: SubscribeResult = await node.filter.subscribe(
      [createDecoder(topic, eciesPrivateKey, {clusterId: networkConfig.clusterId, shard: networkConfig.shards[0]})],
      async (wakuMessage) => {
      try {
        const msg = ChatMessage.decode(wakuMessage.payload);

        if (checkDuplicate(wakuMessage, msg)) return

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
    })

    if (subResult.error) {
      throw new Error(subResult.error)
    }

    subscription = subResult.subscription
  } catch (e) {
    console.error('Error creating subscription:', e);
    process.exit(1);
  }

  if (error) {
    console.error("Error creating subscription", error);
    process.exit(1);
  }
  return subscription
};

  // "Ensure" the subscription is ready
/*  for ( let i = 0; i < 20; i++ )  {
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

  ;
}*/

const peers = [
  // '/ip4/0.0.0.0/tcp/30304/p2p/16Uiu2HAm88NMbTS471mza7mA7c18dFxWoTTDVXyec6ithtDazpF8', // default
  '/ip4/0.0.0.0/tcp/30304/p2p/16Uiu2HAkv4AJDA78daNek6nZDJcS7JXtHbB4VnK3d2gKg4dUTAM6', // Cluster 42
  // '/dns4/waku-test.bloxy.one/tcp/30304/p2p/16Uiu2HAmSZbDB7CusdRhgkD81VssRjQV5ZH13FbzCGcdnbbh6VwZ',
]
export const startNode = async () => {
  // console.log("Network config!!!", networkConfig)
  const node = await createLightNode({
    defaultBootstrap: false,
    libp2p: { transports: [tcp()],
      // peerDiscovery: [
      //   wakuPeerExchangeDiscovery(derivePubsubTopicsFromNetworkConfig(networkConfig))
      // ]
    },
    networkConfig: networkConfig,

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
  for (let peer of peers) {
    for ( let i = 0; i < 5; i++ )  {
      try {
        await node.dial(peer);
        break
      } catch (e) {
        console.log("Error dialing peer " + i, e)
        await sleep(1000)
      }
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
