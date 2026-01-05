import axios from 'axios';
import cfonts from 'cfonts';
import gradient from 'gradient-string';
import chalk from 'chalk';
import fs from 'fs/promises';
import readline from 'readline';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import ora from 'ora';
import { ethers } from 'ethers';

const logger = {
  info: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || 'ℹ️  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.green('INFO');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  warn: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '⚠️ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.yellow('WARN');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  error: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '❌ ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.red('ERROR');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  },
  debug: (msg, options = {}) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const emoji = options.emoji || '🔍  ';
    const context = options.context ? `[${options.context}] ` : '';
    const level = chalk.blue('DEBUG');
    const formattedMsg = `[ ${chalk.gray(timestamp)} ] ${emoji}${level} ${chalk.white(context.padEnd(20))}${chalk.white(msg)}`;
    console.log(formattedMsg);
  }
};

function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function countdown(seconds, message) {
  return new Promise((resolve) => {
    let remaining = seconds;
    process.stdout.write(`${message} ${remaining}s remaining...`);
    const interval = setInterval(() => {
      remaining--;
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(`${message} ${remaining}s remaining...`);
      if (remaining <= 0) {
        clearInterval(interval);
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        resolve();
      }
    }, 1000);
  });
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function centerText(text, width) {
  const cleanText = stripAnsi(text);
  const textLength = cleanText.length;
  const totalPadding = Math.max(0, width - textLength);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${text}${' '.repeat(rightPadding)}`;
}

function printHeader(title) {
  const width = 80;
  console.log(gradient.morning(`┬${'─'.repeat(width - 2)}┬`));
  console.log(gradient.morning(`│ ${title.padEnd(width - 4)} │`));
  console.log(gradient.morning(`┴${'─'.repeat(width - 2)}┴`));
}

function printInfo(label, value, context) {
  logger.info(`${label.padEnd(15)}: ${chalk.cyan(value)}`, { emoji: '📍 ', context });
}

function printProfileInfo(address, points, rank, balance, context) {
  printHeader(`Profile Info ${context}`);
  printInfo('Wallet Address', maskAddress(address), context);
  printInfo('Total Points', points.toString(), context);
  printInfo('Rank', rank.toString(), context);
  printInfo('X1T Balance', balance.toString(), context);
  console.log('\n');
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/102.0'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getAxiosConfig(proxy, token = null) {
  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': 'https://testnet.x1ecochain.com',
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': 'https://testnet.x1ecochain.com/',
    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'user-agent': getRandomUserAgent()
  };
  if (token) {
    headers['authorization'] = token;
  }
  const config = {
    headers,
    timeout: 60000
  };
  if (proxy) {
    config.httpsAgent = newAgent(proxy);
    config.proxy = false;
  }
  return config;
}

function newAgent(proxy) {
  if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
    return new HttpsProxyAgent(proxy);
  } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
    return new SocksProxyAgent(proxy);
  } else {
    logger.warn(`Unsupported proxy: ${proxy}`);
    return null;
  }
}

async function requestWithRetry(method, url, payload = null, config = {}, retries = 3, backoff = 2000, context) {
  for (let i = 0; i < retries; i++) {
    try {
      let response;
      if (method.toLowerCase() === 'get') {
        response = await axios.get(url, config);
      } else if (method.toLowerCase() === 'post') {
        response = await axios.post(url, payload, config);
      } else {
        throw new Error(`Method ${method} not supported`);
      }
      return response;
    } catch (error) {
      let errorMsg = error.message;
      if (error.response) {
        errorMsg += ` | Status: ${error.response.status} | Body: ${JSON.stringify(error.response.data || 'No body')}`;
      }
      logger.error(`Request failed: ${errorMsg}`, { context });

      if (error.response && error.response.status === 429) {
        backoff = Math.max(backoff, 5000);
      }

      if (error.response && error.response.status >= 500 && i < retries - 1) {
        logger.warn(`Retrying ${method.toUpperCase()} ${url} (${i + 1}/${retries}) due to server error`, { emoji: '🔄', context });
        await delay(backoff / 1000);
        backoff *= 2;
        continue;
      }
      if (i < retries - 1) {
        logger.warn(`Retrying ${method.toUpperCase()} ${url} (${i + 1}/${retries})`, { emoji: '🔄', context });
        await delay(backoff / 1000);
        backoff *= 1.5;
        continue;
      }
      throw error;
    }
  }
}

async function readAccounts() {
  try {
    const data = await fs.readFile('pk.txt', 'utf-8');
    const privateKeys = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const accounts = privateKeys.map(pk => ({ privateKey: pk }));
    if (accounts.length === 0) {
      throw new Error('No private keys found in pk.txt');
    }
    logger.info(`Loaded ${accounts.length} account${accounts.length === 1 ? '' : 's'}`, { emoji: '🔑 ' });
    return accounts;
  } catch (error) {
    logger.error(`Failed to read pk.txt: ${error.message}`, { emoji: '❌ ' });
    return [];
  }
}

async function readProxies() {
  try {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (proxies.length === 0) {
      logger.warn('No proxies found. Proceeding without proxy.', { emoji: '⚠️ ' });
    } else {
      logger.info(`Loaded ${proxies.length} prox${proxies.length === 1 ? 'y' : 'ies'}`, { emoji: '🌐 ' });
    }
    return proxies;
  } catch (error) {
    logger.warn('proxy.txt not found.', { emoji: '⚠️ ' });
    return [];
  }
}

function maskAddress(address) {
  return address ? `${address.slice(0, 6)}${'*'.repeat(6)}${address.slice(-6)}` : 'N/A';
}

function deriveWalletAddress(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
  } catch (error) {
    logger.error(`Failed to derive address: ${error.message}`);
    return null;
  }
}

async function signMessageAndLogin(privateKey, address, proxy, context) {
  const url = 'https://testnet-api.x1.one/signin';
  const wallet = new ethers.Wallet(privateKey);
  const spinner = ora({ text: 'Signing and logging in...', spinner: 'dots' }).start();
  try {
    const getConfig = getAxiosConfig(proxy);
    const getUrl = `${url}?address=${address}`;
    const getResponse = await requestWithRetry('get', getUrl, null, getConfig, 3, 2000, context);
    const message = getResponse.data.message;
    if (!message) {
      throw new Error('No message received from signin GET');
    }

    const signature = await wallet.signMessage(message);

    const payload = {
      signature,
      address,
      ref_code: ""
    };
    const postConfig = getAxiosConfig(proxy);
    const postResponse = await requestWithRetry('post', url, payload, postConfig, 3, 2000, context);

    spinner.stop();
    if (postResponse.data.token) {
      return postResponse.data.token;
    } else {
      throw new Error('Login failed: No token received');
    }
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to sign and login: ${error.message}`));
    return null;
  }
}

async function getQuests(proxy, token, context) {
  const url = 'https://testnet-api.x1.one/quests';
  const config = getAxiosConfig(proxy, token);
  const spinner = ora({ text: 'Fetching quests...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('get', url, null, config, 3, 2000, context);
    spinner.stop();
    return response.data;
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to fetch quests: ${error.message}`));
    return null;
  }
}

async function completeQuest(questId, questName, proxy, token, context) {
  const url = `https://testnet-api.x1.one/quests?quest_id=${questId}`;
  const config = getAxiosConfig(proxy, token);
  config.validateStatus = (status) => status >= 200 && status < 500;
  const spinner = ora({ text: `Completing quest ${questName}...`, spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('post', url, {}, config, 3, 2000, context);
    if (response.status === 400 || !response.data.message.includes('successfully')) {
      spinner.warn(chalk.bold.yellowBright(` Quest ${questName} ${response.data.message || 'already completed'}`));
      return { success: false, message: response.data.message || 'Already completed' };
    }
    spinner.succeed(chalk.bold.greenBright(` Quest ${questName} Completed! Reward: ${response.data.reward}`));
    return { success: true };
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to complete quest ${questName}: ${error.message}`));
    return null;
  }
}

async function claimFaucet(address, proxy, context) {
  const url = `https://nft-api.x1.one/testnet/faucet?address=${address}`;
  const config = getAxiosConfig(proxy);
  const spinner = ora({ text: 'Claiming faucet...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('get', url, {}, config, 3, 2000, context);
    if (response.data === 'ok') {
      spinner.succeed(chalk.bold.greenBright(' Faucet claimed successfully!'));
      return { success: true };
    } else {
      throw new Error('Faucet claim failed');
    }
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to claim faucet: ${error.message}`));
    return null;
  }
}

async function sendDailyTx(privateKey, address, proxy, context) {
  const rpcUrl = 'https://maculatus-rpc.x1eco.com';
  const chainId = 10778;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const randomAddress = ethers.Wallet.createRandom().address;
  const amount = (Math.random() * (0.5 - 0.1) + 0.1).toFixed(6);
  const value = ethers.parseEther(amount);
  const spinner = ora({ text: `Sending ${amount} X1T to ${maskAddress(randomAddress)}...`, spinner: 'dots' }).start();
  try {
    const tx = await wallet.sendTransaction({
      to: randomAddress,
      value,
      chainId
    });
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      spinner.succeed(chalk.bold.greenBright(` TX sent successfully! Hash: ${receipt.hash}`));
      return { success: true };
    } else {
      throw new Error('TX failed');
    }
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to send TX: ${error.message}`));
    return null;
  }
}

async function getAccountInfo(proxy, token, privateKey, context) {
  const url = 'https://testnet-api.x1.one/me';
  const config = getAxiosConfig(proxy, token);
  const spinner = ora({ text: 'Retrieving account info...', spinner: 'dots' }).start();
  try {
    const response = await requestWithRetry('get', url, null, config, 3, 2000, context);
    const provider = new ethers.JsonRpcProvider('https://maculatus-rpc.x1eco.com');
    const wallet = new ethers.Wallet(privateKey, provider);
    const balanceWei = await provider.getBalance(wallet.address);
    const balance = ethers.formatEther(balanceWei);
    spinner.stop();
    return {
      address: response.data.address,
      points: response.data.points,
      rank: response.data.rank,
      balance
    };
  } catch (error) {
    spinner.fail(chalk.bold.redBright(` Failed to retrieve account info: ${error.message}`));
    return null;
  }
}

async function getPublicIP(proxy, context) {
  try {
    const config = getAxiosConfig(proxy);
    const response = await requestWithRetry('get', 'https://api.ipify.org?format=json', null, config, 3, 2000, context);
    return response.data.ip || 'Unknown';
  } catch (error) {
    logger.error(`Failed to get IP: ${error.message}`, { emoji: '❌ ', context });
    return 'Error retrieving IP';
  }
}

async function processAccount(account, index, total, proxy) {
  const context = `Account ${index + 1}/${total}`;
  logger.info(chalk.bold.magentaBright(`Starting account processing`), { emoji: '🚀 ', context });

  const { privateKey } = account;
  const address = deriveWalletAddress(privateKey);
  if (!address) {
    logger.error('Invalid private key', { emoji: '❌ ', context });
    return;
  }

  printHeader(`Account Info ${context}`);
  printInfo('Masked Address', maskAddress(address), context);
  const ip = await getPublicIP(proxy, context);
  printInfo('IP', ip, context);
  console.log('\n');

  try {
    logger.info('Starting authentication process...', { emoji: '🔐 ', context });
    const token = await signMessageAndLogin(privateKey, address, proxy, context);
    if (!token) return;

    logger.info(chalk.bold.greenBright(`Login Successfully`), { emoji: '✅ ', context });
    await delay(5);

    console.log('\n');

    logger.info('Starting Daily Checkin Process...', { emoji: '🛎️ ', context });
    let quests = await getQuests(proxy, token, context);
    if (!quests) return;
    const dailyLoginQuest = quests.find(q => q.title === 'Daily Login');
    if (!dailyLoginQuest) {
      logger.warn('Daily Login quest not found.', { emoji: '⚠️ ', context });
    } else if (!dailyLoginQuest.is_completed_today) {
      const checkinResult = await completeQuest(dailyLoginQuest.id, 'Daily Login', proxy, token, context);
      if (checkinResult && checkinResult.success) {
        await delay(5);
      }
    } else {
      logger.warn(chalk.bold.yellowBright('Already Checked-In Today.'), { emoji: '⚠️ ', context });
    }
    await delay(2);

    console.log('\n');

    logger.info('Starting Claim Faucet Process...', { emoji: '💧 ', context });
    quests = await getQuests(proxy, token, context); 
    if (!quests) return;
    const faucetQuest = quests.find(q => q.title === 'Claim Faucet');
    if (!faucetQuest) {
      logger.warn('Claim Faucet quest not found.', { emoji: '⚠️ ', context });
    } else if (!faucetQuest.is_completed_today) {
      const faucetResult = await claimFaucet(address, proxy, context);
      if (faucetResult && faucetResult.success) {
        await delay(5);
        const completeResult = await completeQuest(faucetQuest.id, 'Claim Faucet', proxy, token, context);
        if (completeResult && completeResult.success) {
          await delay(5);
        }
      }
    } else {
      logger.warn(chalk.bold.yellowBright('Already Claimed Faucet Today.'), { emoji: '⚠️ ', context });
    }
    await delay(2);

    console.log('\n');

    logger.info('Starting Daily TX Process...', { emoji: '📤 ', context });
    quests = await getQuests(proxy, token, context);
    if (!quests) return;
    const sendX1TQuest = quests.find(q => q.title === 'Send X1T');
    if (!sendX1TQuest) {
      logger.warn('Send X1T quest not found.', { emoji: '⚠️ ', context });
    } else if (!sendX1TQuest.is_completed_today) {
      const txResult = await sendDailyTx(privateKey, address, proxy, context);
      if (txResult && txResult.success) {
        await delay(5);
        const completeResult = await completeQuest(sendX1TQuest.id, 'Send X1T', proxy, token, context);
        if (completeResult && completeResult.success) {
          await delay(5);
        }
      }
    } else {
      logger.warn(chalk.bold.yellowBright('Already Sent TX Today.'), { emoji: '⚠️ ', context });
    }
    await delay(2);

    console.log('\n');
    await delay(5);

    const accountInfo = await getAccountInfo(proxy, token, privateKey, context);
    if (accountInfo) {
      printProfileInfo(accountInfo.address, accountInfo.points, accountInfo.rank, accountInfo.balance, context);
    }

    logger.info(chalk.bold.greenBright(`Completed account processing`), { emoji: '🎉 ', context });
    console.log(chalk.cyanBright('________________________________________________________________________________'));
  } catch (error) {
    logger.error(`Error processing account: ${error.message}`, { emoji: '❌ ', context });
  }
}

let globalUseProxy = false;
let globalProxies = [];

async function initializeConfig() {
  const useProxyAns = await askQuestion(chalk.cyanBright('🔌 Do You Want to Use Proxy? (y/n): '));
  if (useProxyAns.trim().toLowerCase() === 'y') {
    globalUseProxy = true;
    globalProxies = await readProxies();
    if (globalProxies.length === 0) {
      globalUseProxy = false;
      logger.warn('No proxies available, proceeding without proxy.', { emoji: '⚠️ ' });
    }
  } else {
    logger.info('Proceeding without proxy.', { emoji: 'ℹ️ ' });
  }
}

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function runCycle() {
  const accounts = await readAccounts();
  if (accounts.length === 0) {
    logger.error('No accounts found in pk.txt. Exiting cycle.', { emoji: '❌ ' });
    return;
  }

  for (let i = 0; i < accounts.length; i++) {
    const proxy = globalUseProxy ? globalProxies[i % globalProxies.length] : null;
    try {
      await processAccount(accounts[i], i, accounts.length, proxy);
    } catch (error) {
      logger.error(`Error processing account: ${error.message}`, { emoji: '❌ ', context: `Account ${i + 1}/${accounts.length}` });
    }
    if (i < accounts.length - 1) {
      console.log('\n\n');
    }
    await delay(Math.floor(Math.random() * 6) + 10);
  }
}

async function run() {
  const terminalWidth = process.stdout.columns || 80;
  cfonts.say('NT EXHAUST', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta'],
    background: 'transparent',
    letterSpacing: 1,
    lineHeight: 1,
    space: true
  });
  console.log(gradient.retro(centerText('=== Telegram Channel 🚀 : NT Exhaust (@NTExhaust) ===', terminalWidth)));
  console.log(gradient.retro(centerText('✪ BOT X1 EcoCHAIN AUTO DAILY ✪', terminalWidth)));
  console.log('\n');
  await initializeConfig();

  while (true) {
    await runCycle();
    console.log();
    logger.info(chalk.bold.yellowBright('Cycle completed. Waiting 24 hours...'), { emoji: '🔄 ' });
    await delay(86400);
  }
}

run().catch(error => logger.error(`Fatal error: ${error.message}`, { emoji: '❌' }));
