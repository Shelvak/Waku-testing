import {
  HANDSHAKE_TOPIC,
  randomTopic,
  sendMsg,
  sleep,
  startNode,
  subscribeTo,
} from './common'

const main = async () => {
  const node = await startNode();

  const flowFn = async (node, topic, msg) => {
    switch (msg.state) {
      case "Proof":
        // armar el tx con msg.text[...]
        await sendMsg(node, msg.replyTo, topic, 'Sent', `TX sent: jhkjhkjhkjhkj`)
        // Simulate confirmation...
        await sleep(2000)
        await sendMsg(node, msg.replyTo, topic, 'Error', `TX la comiste`)

        break;
      default:
        console.log("[flowFn] unknown state: ", msg.state)
        break;
    }
  }

  await subscribeTo(node, HANDSHAKE_TOPIC, async (node, topic, msg) => {
    switch (msg.state) {
      case "Handshake":
        // Create a random topic to receive messages
        const privTopic = randomTopic();

        await subscribeTo(node, privTopic, flowFn);

        await sendMsg(node, msg.replyTo, privTopic, 'ACK', "whatever")
        break;
      default:
        console.log("[handshake] unknown state: ", msg.state)
        break;
    }
  });
};

main().catch(console.error);
