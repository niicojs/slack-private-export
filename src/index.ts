require('dotenv').config();

import * as fs from 'fs';
import * as Slack from 'slack';
import * as dayjs from 'dayjs';
import * as request from 'request';
import pLimit from 'p-limit';
import compress from './compress';

const limit = pLimit(5);

const getMessages = async (token: string, channel: string) => {
  let response = await Slack.conversations.history({ token, channel });
  let results = response.messages;
  while (response.has_more) {
    const cursor = response.response_metadata.next_cursor;
    response = await Slack.conversations.history({ token, channel, cursor });
    results = results.concat(response.messages);
  }
  return results;
};

const download = (url, file, token) =>
  new Promise((resolve, reject) => {
    request({
      url,
      headers: {
        authorization: `Bearer ${token}`
      },
      encoding: null
    })
      .pipe(fs.createWriteStream(file))
      .on('finish', resolve)
      .on('error', reject);
  });

const downloadFiles = async (token: string, messages: any[]) => {
  const tasks = [];
  for (const message of messages) {
    if ('files' in message) {
      for (const file of message.files) {
        if (file.mode !== 'external' && file.url_private) {
          const url = file.url_private_download;
          await fs.promises.mkdir(`export/_files/${file.id}`, {
            recursive: true
          });
          file.url_private_download_org = url;
          file.url_private_download = `_files/${file.id}/${file.name}`;
          tasks.push(
            limit(() => {
              console.log(`Downloading ${file.id}/${file.name}`);
              return download(url, `export/_files/${file.id}/${file.name}`, token);
            }
          ));
        }
      }
    }
  }
  return tasks;
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
  const token = process.env.LEGACY_TOKEN;
  if (!token) {
    console.log('LEGACY_TOKEN not found. Configure first');
    return;
  }

  try {
    await fs.promises.mkdir('export');
    await fs.promises.mkdir('export/_files');
  } catch (e) {}

  const today = dayjs().format('YYYY-MM-DD');
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

  let downloads = [];

  for (const channel of privates) {
    console.log(`  channel ${channel.name}`);
    try {
      await fs.promises.mkdir(`export/${channel.name}`);
    } catch (e) {}

    const messages = await getMessages(token, channel.id);
    const promises = await downloadFiles(token, messages);
    downloads = [...downloads, ...promises];

    await fs.promises.writeFile(
      `export/${channel.name}/${today}.json`,
      JSON.stringify(messages, null, 2),
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

  console.log('Waiting for downloads to finish...');
  await Promise.all(downloads);

  console.log('Building zip file...');
  await compress('export', 'export-private.zip');

  console.log('Done.');
})();
