import protobuf from "protobufjs";
import * as fs from "fs";

import {
  createLightNode,
  waitForRemotePeer,
  createDecoder,
  bytesToUtf8,
  Protocols,
} from "@waku/sdk";

// import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";

// import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";

const CONTENT_TOPIC = "/coffer/0.1/test/proto";
const Decoder = createDecoder(CONTENT_TOPIC);

// const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
// const wallet = Keypair.fromSecretKey(new Uint8Array(
//   JSON.parse(
//       fs.readFileSync(process.env.HOME + '/.config/solana/id.json').toString()
//     ) // ['_keypair']['secretKey'])
// ))
// const provider = new AnchorProvider(connection, new Wallet(wallet), {});
// const cofferIdl = JSON.parse(fs.readFileSync("./coffer-idl.json", "utf-8"));
// const COFFER_ID = 'asasdasd'
// const cofferProgram = new Program(cofferIdl, COFFER_ID, provider);

// Protobuf bytes => Uint8Array (browser) or Buffer (node)
// repeated indicates an array of bytes
const ProofMessage = new protobuf.Type("ProofMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("proofsArray", 2, "bytes", "repeated"));

const main = async () => {
  const node = await createLightNode({ defaultBootstrap: true });

  await node.start();

  // try to reconnect with peers
  for ( let i = 0; i < 20; i++ )  {
    try {
      await waitForRemotePeer(node, [Protocols.Filter], 2000);
      if (node.isConnected())
        break
    } catch (e) {
      console.log("Error waiting for remote peer " + i)
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log("Connected =D", node.libp2p.peerId.toString())

  // @ts-ignore
  const { error, subscription } = await node.filter.createSubscription({ contentTopics: [CONTENT_TOPIC] });

  if (error) { throw error; }

  // @ts-ignore
  const unsubscribeFn = await subscription.subscribe(
    [Decoder],
    async (wakuMessage) => {
      const messageObj = ProofMessage.decode(wakuMessage.payload);
      console.log(`\n\n\n ${new Date(parseInt(messageObj.timestamp))} # ${bytesToUtf8(messageObj.proofsArray[0])} # ${bytesToUtf8(messageObj.proofsArray[1])}\n\n\n`);

      console.log("Typeof:", typeof messageObj.proofsArray, messageObj.proofsArray)

      // await cofferProgram.methods.pay(
      //   ...messageObj.proofsArrays
      // )
      // .accounts({
      // })
      // // .signers([])
      // .rpc();
    }
  );

  try {
    await subscription.ping()

    console.log("Listening for messages...");
  } catch (e) {
    console.log("Error pinging subscription")
  }

};

main().catch(console.error);
