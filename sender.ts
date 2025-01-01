import {
  HANDSHAKE_TOPIC,
  sendMsg,
  subscribeTo,
  startNode,
  randomTopic,
} from './common'
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {
  bytesToUtf8,
  // utf8ToBytes,
} from "@waku/sdk";


const sendProofs = async (node, topic, replyTo) => {
  await sendMsg({
      node, topic, replyTo, state: "Proof", msg: "asdasdqweqwe"
  });
}

const main = async () => {
  const node = await startNode();

  // Create a random topic to receive messages
  const privTopic = randomTopic();

  let ack = false;

  const verifySignature = (message, signature, publicKey) => {
    try {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(bytesToUtf8(signature))
      const publicKeyBytes = bs58.decode(bytesToUtf8(publicKey))
      // const publicKeyBytes = bs58.decode("1pDMJMkbH5HexixGiwJ1yMuH9EMz28DGyWebuRZy6qA")

      // publicKey has to be a Uint8Array
      return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (e) {
      console.error('Error verifying signature:', e);
      return false
    }
  }

  await subscribeTo(node, privTopic, async (node, topic, msg) => {
      switch (msg.state) {
        case "ACK":
          if (ack) { // already working with some other subscriber
          await sendMsg({
              node: node,
              topic: msg.replyTo,
              state: 'Taken',
            });
          } else {
            ack = true
            await sendProofs(node, msg.replyTo, topic);
          }
          break;
        case "Sent":
          console.log("TX sent... waiting for confirmation", msg.text)
          break;
        case "Cypher":
          if (verifySignature(msg.text, msg.signedMsg, msg.pubKey)) {
            console.log("TX sent... waiting for confirmation", msg.text)
          } else {
            console.error("TX error: invalid signature")
          }

          // console.log("TX sent... waiting for confirmation", msg.text[0])
          break;
        case "Error":
          console.log("TX error", msg.text[0]) // build error
          break;
        default:
          console.log("[handshake] unknown state: ", msg.state)
          break;
      }
    }
  );

  // Once the subscription is ready, we can start the dance
  await sendMsg({node, topic: HANDSHAKE_TOPIC, replyTo: privTopic, state: "Handshake", msg: "hi"});
};

main().catch(console.error);
