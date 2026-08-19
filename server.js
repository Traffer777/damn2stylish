// DAMN2STYLISH — Express server for Timeweb App Platform.
// Serves /public/* as static and exposes POST /api/lead which forwards
// the site's contact form to Telegram via sendMessage.
// Secrets come from env vars (never committed):
//   TELEGRAM_BOT_TOKEN — from @BotFather
//   TELEGRAM_CHAT_ID   — chat that receives leads
//   PORT               — provided by Timeweb (falls back to 8080, Timeweb's default edge port)

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '32kb' }));
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
}));

app.post('/api/lead', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 200);
  const contact = String(req.body?.contact || '').trim().slice(0, 200);
  const msg = String(req.body?.msg || '').trim().slice(0, 2000);

  if (!name || !contact) {
    return res.status(400).json({ ok: false, error: 'name_and_contact_required' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(500).json({ ok: false, error: 'bot_not_configured' });
  }

  const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const text =
    `🎬 <b>Новая заявка — DAMN2STYLISH</b>\n\n` +
    `👤 <b>Имя:</b> ${esc(name)}\n` +
    `📱 <b>Контакт:</b> ${esc(contact)}\n` +
    `📝 <b>Проект:</b> ${esc(msg || '—')}`;

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await tg.json();
    if (!tg.ok || !data.ok) {
      return res.status(502).json({ ok: false, error: 'telegram_error', detail: data });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'network_error' });
  }
});

// health for platform probes
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// Bind explicitly to 0.0.0.0 — Node 22 defaults to IPv6 (::), but many
// container proxies (incl. Timeweb App Platform) route via IPv4 only.
// Default port 8080: Timeweb's edge proxy routes to 8080 unless told otherwise,
// so listening there avoids the flaky runtime port-rediscovery step.
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => console.log(`server up on ${host}:${port}`));
