// import { Keypair } from "@solana/web3.js";
import protobuf from "protobufjs";

import {
  createLightNode,
  utf8ToBytes,
  waitForRemotePeer,
  createEncoder,
  Protocols,
} from "@waku/sdk";

const CONTENT_TOPIC = "/coffer/0.1/test/proto";

// const keypair = Keypair.generate();

const Encoder = createEncoder({ contentTopic: CONTENT_TOPIC });
// Protobuf bytes => Uint8Array (browser) or Buffer (node)
// repeated indicates an array of bytes
const ProofMessage = new protobuf.Type("ProofMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("proofsArray", 2, "bytes", "repeated"));


const main = async () => {
  const node = await createLightNode({ defaultBootstrap: true });

  await node.start();

  for ( let i = 0; i < 20; i++ )  {
    try {
      await waitForRemotePeer(node, [Protocols.LightPush], 2000);
      if (node.isConnected())
        break
    } catch (e) {
      console.log("Error waiting for remote peer " + i)
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log("Connected =D")
  console.log(node.libp2p.getPeers())

  const protoMessage = ProofMessage.create({
    timestamp: Date.now(),
    proofsArray: [
      utf8ToBytes("primera linea"),
      utf8ToBytes("seg linea"),
    ]
  });

  await node.lightPush.send(Encoder, {
    payload: ProofMessage.encode(protoMessage).finish(),
  });

  console.log("Message sent!");

  process.exit(0);
};

main().catch(console.error);
