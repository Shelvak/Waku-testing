import {
  HANDSHAKE_TOPIC,
  sendMsg,
  subscribeTo,
  startNode,
  randomTopic,
} from './common'


const sendProofs = async (node, topic, replyTo) => {
  await sendMsg(node, topic, replyTo, "Proof", "asdasd", "qweqwe");
}

const main = async () => {
  const node = await startNode();

  // Create a random topic to receive messages
  const privTopic = randomTopic();

  await subscribeTo(node, privTopic, async (node, topic, msg) => {
      switch (msg.state) {
        case "ACK":
          await sendProofs(node, msg.replyTo, topic);
          break;
        case "Sent":
          console.log("TX sent... waiting for confirmation", msg.text[0])
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
  await sendMsg(node, HANDSHAKE_TOPIC, privTopic, "Handshake", "hi");
};

main().catch(console.error);
