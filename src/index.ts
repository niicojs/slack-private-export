require('dotenv').config();

import * as fs from 'fs';
import * as Slack from 'slack';
import * as dayjs from 'dayjs';
import compress from './compress';

const getConversations = async (token, channel) => {
  let response = await Slack.conversations.history({ token, channel });
  let results = response.messages;
  while (response.has_more) {
    const cursor = response.response_metadata.next_cursor;
    response = await Slack.conversations.history({ token, channel, cursor });
    results = results.concat(response.messages);
  }
  return results;
};

const getUSers = async token => {
  let response = await Slack.users.list({ token });
  let results = response.members;
  while (response.has_more) {
    const cursor = response.response_metadata.next_cursor;
    response = await Slack.users.list({ token, cursor });
    results = results.concat(response.messages);
  }
  return results;
};

(async () => {
  console.log('Starting...');
  try {
    await fs.promises.mkdir('export');
  } catch (e) {}

  const today = dayjs().format('YYYY-MM-DD');
  const token = process.env.LEGACY_TOKEN;
  const conversations = await Slack.conversations.list({
    token,
    types: 'public_channel,private_channel'
  });

  const privates = conversations.channels.filter(c => c.is_private);

  await fs.promises.writeFile(
    `export/channels.json`,
    JSON.stringify(privates, null, 2),
    'utf8'
  );

  for (const channel of privates) {
    console.log(`  channel ${channel.name}`);
    try {
      await fs.promises.mkdir(`export/${channel.name}`);
    } catch (e) {}

    const conversations = await getConversations(token, channel.id);

    await fs.promises.writeFile(
      `export/${channel.name}/${today}.json`,
      JSON.stringify(conversations, null, 2),
      'utf8'
    );
  }

  const users = await getUSers(token);
  await fs.promises.writeFile(
    `export/users.json`,
    JSON.stringify(users, null, 2),
    'utf8'
  );

  await fs.promises.writeFile('export/integration_logs.json', '[]', 'utf8');

  console.log('Building zip file...');
  await compress('export', 'export-private.zip');

  console.log('Done.');
})();
