import {
  HANDSHAKE_TOPIC,
  randomTopic,
  sendMsg,
  sleep,
  startNode,
  subscribeTo,
} from './common'
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const main = async () => {
  const node = await startNode();

  // Replace this for the solver key
  const keypair = Keypair.fromSecretKey( Uint8Array.from([
        8, 254, 227,   1,  69,  56, 110, 231, 145,  93, 168,
        131,  96, 182, 118, 246, 208, 128,  65, 136, 234, 144,
        199,  34,  53,  15,  96, 144,  50,  82,  38,  79, 181,
        191, 237, 163, 103, 139, 110, 247,  72, 196,  74, 144,
        191, 209,   0, 141, 185, 211,  76, 205,  84, 162, 102,
        38,   6, 215, 169, 216, 176, 130, 234, 205
      ]
    )
  )

  const signBody = (body) => {
      const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
      const signature = nacl.sign.detached(bodyBytes, keypair.secretKey);

      return bs58.encode(signature)
  }

  const flowFn = async (node, topic, msg) => {
    switch (msg.state) {
      case "Proof":
        // armar el tx con msg.body[...]
        // await sendMsg(node, msg.replyTo, topic, 'Sent', `TX sent: jhkjhkjhkjhkj`)
        // // Simulate confirmation...
        // await sleep(2000)
        // await sendMsg(node, msg.replyTo, topic, 'Error', `TX la comiste`)

        try {
          // const pubKey = keypair.publicKey.toBase58()
          const body = ["TX sent: jhkjhkjhkjhkj"]
          const signedBody = signBody(body)

          await sendMsg({
            node,
            topic: msg.replyTo,
            replyTo: topic,
            state: 'Cypher',
            // pubKey,
            signedBody,
            body
          })
        } catch (e) {
          console.error('Error sending body:', e);
        }
        break;
      default:
        console.log("[flowFn] unknown state: ", msg.state)
        break;
    }
  }

  await subscribeTo(node, HANDSHAKE_TOPIC, async (node, topic, msg) => {
    console.log("Subscribed to HANDSHAKE")
    try {
    switch (msg.state) {
      case "Handshake":
        // Create a random topic to receive bodys
        const privTopic = randomTopic();

        await subscribeTo(node, privTopic, flowFn);

        await sendMsg({
          node,
          topic: msg.replyTo,
          replyTo: privTopic,
          state: 'ACK',
          body: ["whatever"]
        })
        break;
      default:
        console.log("[handshake] unknown state: ", msg.state)
        break;
    }
    } catch (e) {
      console.error('Error subscribe body:', e);
    }

  });
};

main().catch(console.error);
