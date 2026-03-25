import { neon } from "@netlify/neon";

const PAGE_ACCESS_TOKEN = EAAWrmUCZBxdkBRDmS3nvaw0iz5VNm6ttBgTobzpdSY4GeypgKQZAZCSSbO0AQkUlrNRXgdPTJGMFd0ZBbX9yKLvfyJMf9rzYcdTt7pJDG6tNr4uxUZBVUgFWVqYietMxkbJYAONkt2aooGYJ18FMShxEcNTZCpFD505PVZC9yytQ74ZBRLGAhZAEbmhY1GIlZAEIz3oYS4ebkZCxgZDZD;
const VERIFY_TOKEN = "landoflegacy2025";
const MSG_API = "https://graph.facebook.com/v21.0/me/messages";

async function send(rid, text) {
  await fetch(`${MSG_API}?access_token=${PAGE_ACCESS_TOKEN}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: rid }, message: { text } }),
  });
}

async function sendQR(rid, text, replies) {
  await fetch(`${MSG_API}?access_token=${PAGE_ACCESS_TOKEN}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: rid }, message: { text, quick_replies: replies.map(r => ({ content_type: "text", title: r, payload: r.toUpperCase().replace(/\s/g, "_") })) } }),
  });
}

async function handle(sid, msg, name) {
  const sql = neon();
  const m = msg.toLowerCase();
  const ex = await sql`SELECT * FROM leads WHERE profile_url = ${sid} AND status NOT IN ('closed','discarded') ORDER BY created_at DESC LIMIT 1`;

  if (ex.length > 0) {
    const l = ex[0];
    if (l.status === "booked") { await send(sid, `Hey ${name}! You already have an appointment set. Our specialist will reach out soon!`); return; }
    if (m.includes("yes") || m.includes("sure") || m.includes("interested") || m.includes("book") || m.includes("schedule") || m.includes("appointment")) {
      await sql`UPDATE leads SET status='booked', notes=COALESCE(notes,'')||' | YES via Messenger: '||${msg} WHERE id=${l.id}`;
      await send(sid, `Awesome ${name}! I'm connecting you with a specialist now. They'll reach out within a few hours. What time works best - morning, afternoon, or evening?`);
      return;
    }
    if (m.includes("morning") || m.includes("afternoon") || m.includes("evening") || m.includes("pm") || m.includes("am")) {
      await sql`UPDATE leads SET appointment_time=${msg}, notes=COALESCE(notes,'')||' | Time: '||${msg} WHERE id=${l.id}`;
      await send(sid, `Noted! Our specialist will reach out then. Thanks ${name}!`);
      return;
    }
    if (m.includes("no") || m.includes("not interested") || m.includes("stop")) {
      await sql`UPDATE leads SET status='discarded', notes=COALESCE(notes,'')||' | Declined' WHERE id=${l.id}`;
      await send(sid, `No worries ${name}. We're here if anything changes. Have a great day!`);
      return;
    }
    await send(sid, `Thanks for reaching out ${name}! Would you like to schedule a quick call with one of our specialists? No pressure at all.`);
    return;
  }

  await sql`INSERT INTO leads (name,source,post_text,profile_url,intent,status,ai_draft) VALUES (${name||'Messenger Lead'},'Facebook Messenger',${msg},${sid},'medium','new','Auto from Messenger')`;
  await sendQR(sid, `Hey ${name || "there"}! Thanks for reaching out to Land of Legacy. We help families protect what matters most.\n\nWant to learn more about coverage options?`, ["Yes, tell me more", "Book appointment", "Just browsing"]);
}

export default async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body.object === "page") {
        for (const entry of body.entry || []) {
          for (const ev of entry.messaging || []) {
            if (ev.message && ev.message.text) {
              let name = "there";
              try { const p = await (await fetch(`https://graph.facebook.com/v21.0/${ev.sender.id}?fields=first_name&access_token=${PAGE_ACCESS_TOKEN}`)).json(); if (p.first_name) name = p.first_name; } catch {}
              await handle(ev.sender.id, ev.message.text, name);
            }
          }
        }
      }
      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch (e) { console.error("Messenger error:", e); return new Response("ERROR", { status: 500 }); }
  }
  return new Response("OK", { status: 200 });
};

export const config = { path: "/.netlify/functions/messenger" };
