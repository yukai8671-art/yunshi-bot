// LINE 星座運勢機器人（Vercel / CommonJS / rawBody 修正）
const express = require('express');
const line = require('@line/bot-sdk');
const dayjs = require('dayjs');
const cheerio = require('cheerio');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
if (!config.channelAccessToken || !config.channelSecret) {
  console.error('請先設定 LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET');
}

const client = new line.Client(config);
const app = express();

// 讓 LINE middleware 能取得 raw body 做簽章驗證（Vercel 必加）
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

const ALIASES = [
  ['白羊','牡羊'], ['金牛'], ['雙子'], ['巨蟹'], ['獅子'], ['處女'],
  ['天秤'], ['天蠍'], ['射手'], ['魔羯','摩羯'], ['水瓶'], ['雙魚']
];
const SIGN_KEYS = ['白羊','金牛','雙子','巨蟹','獅子','處女','天秤','天蠍','射手','魔羯','水瓶','雙魚'];

const SIGN_URLS = {
  白羊: 'https://astro.click108.com.tw/daily_0.php?iAcDay=YYYY-MM-DD&iAstro=0',
  金牛: 'https://astro.click108.com.tw/daily_1.php?iAcDay=YYYY-MM-DD&iAstro=1',
  雙子: 'https://astro.click108.com.tw/daily_2.php?iAcDay=YYYY-MM-DD&iAstro=2',
  巨蟹: 'https://astro.click108.com.tw/daily_3.php?iAcDay=YYYY-MM-DD&iAstro=3',
  獅子: 'https://astro.click108.com.tw/daily_4.php?iAcDay=YYYY-MM-DD&iAstro=4',
  處女: 'https://astro.click108.com.tw/daily_5.php?iAcDay=YYYY-MM-DD&iAstro=5',
  天秤: 'https://astro.click108.com.tw/daily_6.php?iAcDay=YYYY-MM-DD&iAstro=6',
  天蠍: 'https://astro.click108.com.tw/daily_7.php?iAcDay=YYYY-MM-DD&iAstro=7',
  射手: 'https://astro.click108.com.tw/daily_8.php?iAcDay=YYYY-MM-DD&iAstro=8',
  魔羯: 'https://astro.click108.com.tw/daily_9.php?iAcDay=YYYY-MM-DD&iAstro=9',
  水瓶: 'https://astro.click108.com.tw/daily_10.php?iAcDay=YYYY-MM-DD&iAstro=10',
  雙魚: 'https://astro.click108.com.tw/daily_11.php?iAcDay=YYYY-MM-DD&iAstro=11'
};

async function fetchHoroscope(url) {
  const todayTW = dayjs().add(8 - dayjs().utcOffset() / 60, 'hour').format('YYYY-MM-DD');
  const finalUrl = url.replace('YYYY-MM-DD', todayTW);

  const res = await fetch(finalUrl);
  if (!res.ok) throw new Error(`抓取失敗：${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const candidates = ['.TODAY_CONTENT','.TODAY_LUCK','.TODAY','.constellation','.article','#content','.content','.box','#click108staff'];
  let text = '';
  for (const sel of candidates) {
    const t = $(sel).first().text().trim();
    if (t && t.length > 30) { text = t; break; }
  }
  if (!text) {
    const meta = $('meta[name="description"]').attr('content') || '';
    if (meta && meta.length > 20) text = meta.trim();
  }
  if (!text) {
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get().filter(Boolean);
    text = paragraphs.slice(0, 3).join('\n');
  }
  text = text.replace(/[\t\r]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > 800) text = text.slice(0, 780) + '…';
  return { text, src: finalUrl };
}

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all((req.body.events || []).map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// 健康檢查
app.get('/', (_, res) => res.status(200).send('OK'));

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  const raw = (event.message.text || '').trim();
  const signFound = detectSign(raw);
  if (!signFound) return null;

  try {
    const { text, src } = await fetchHoroscope(SIGN_URLS[signFound]);
    const today = dayjs().add(8 - dayjs().utcOffset() / 60, 'hour').format('YYYY/MM/DD');
    return reply(event.replyToken, {
      type: 'text',
      text: `【${signFound}座｜${today}】\n${text}\n—— 來源：${src}`
    });
  } catch (e) {
    console.error(e);
    return reply(event.replyToken, { type: 'text', text: `抓取 ${signFound} 運勢失敗，稍後再試。` });
  }
}

function detectSign(text) {
  for (let i = 0; i < ALIASES.length; i++) {
    for (const name of ALIASES[i]) {
      if (text.includes(name)) return SIGN_KEYS[i];
    }
  }
  return null;
}

function reply(replyToken, message) {
  return client.replyMessage(replyToken, Array.isArray(message) ? message : [message]);
}

app.listen(3000, () => console.log('LINE bot on :3000'));
module.exports = app;
