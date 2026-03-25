import { neon } from "@netlify/neon";

export default async (req) => {
  const sql = neon();
  const H = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: H });
  }

  try {
    const url = new URL(req.url);
    const a = url.searchParams.get("a");

    // ====================== INIT ======================
    if (a === "init") {
      console.log("=== RUNNING INIT ===");

      await sql`CREATE TABLE IF NOT EXISTS daily_sales (
        date_key TEXT PRIMARY KEY, 
        data JSONB NOT NULL DEFAULT '{}'::jsonb, 
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name TEXT DEFAULT '',
        source TEXT DEFAULT '',
        post_text TEXT DEFAULT '',
        author_profile TEXT DEFAULT '',
        post_url TEXT DEFAULT '',
        group_name TEXT DEFAULT '',
        post_date TIMESTAMPTZ,
        intent TEXT DEFAULT 'final expense / iul',
        status TEXT DEFAULT 'new',
        grabbed_by TEXT DEFAULT '',
        grabbed_at TIMESTAMPTZ,
        appointment_time TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        ai_draft TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS kpis (
        id SERIAL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        date_key TEXT NOT NULL,
        dials INT DEFAULT 0,
        contacts INT DEFAULT 0,
        appointments INT DEFAULT 0,
        quotes INT DEFAULT 0,
        apps_submitted INT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(agent_id, date_key)
      )`;

      console.log("Tables created/updated successfully");
      return new Response(JSON.stringify({ ok: true, message: "Schema initialized" }), { headers: H });
    }

    // ====================== LEADS-ADD (Fixed & Optimized) ======================
    if (a === "leads-add") {
  console.log("=== LEADS-ADD INVOKED ===");
  console.log("Full URL:", req.url);

  const verify = url.searchParams.get('verify');
  if (verify !== 'landoflegacy2025') {
    return new Response(JSON.stringify({ error: 'Invalid verify' }), { status: 403, headers: H });
  }

  let leadsArray = [];
  try {
    const bodyText = await req.text();
    const parsed = JSON.parse(bodyText);
    leadsArray = Array.isArray(parsed) ? parsed : (parsed.leads || parsed.data || parsed.items || [parsed]);
  } catch (e) {
    console.error("Parse error:", e);
    return new Response(JSON.stringify({ error: 'Bad JSON' }), { status: 400, headers: H });
  }

  for (const lead of leadsArray) {
    const name = lead.userName || lead.name || lead.user?.name || lead.author || "Unknown Senior";
    const post_text = (lead.content || lead.text || lead.postText || lead.post || "").slice(0, 2000);
    const author_profile = lead.profileUrl || lead.user?.url || lead.user?.profileUrl || "";
    const post_url = lead.postUrl || lead.url || "";
    const group_name = lead.groupName || lead.groupTitle || lead.group || "";
    const post_date = lead.date || lead.time || new Date().toISOString();

    await sql`
      INSERT INTO leads (name, source, post_text, intent, author_profile, post_url, group_name, post_date, status, created_at)
      VALUES (${name}, 'Apify Facebook Groups Lead Extractor Pro', ${post_text}, 'final expense / iul', ${author_profile}, ${post_url}, ${group_name}, ${post_date}, 'new', NOW())
    `;
  }

  return new Response(JSON.stringify({ success: true, inserted: leadsArray.length }), { headers: H });
}

    // ====================== OTHER ACTIONS ======================
        if (a === "leads-list") {
      const s = url.searchParams.get("status") || "new";
      const rows = s === "all" 
        ? await sql`SELECT * FROM leads ORDER BY created_at DESC` 
        : await sql`SELECT * FROM leads WHERE status = ${s} ORDER BY created_at DESC`;
      return new Response(JSON.stringify({ data: rows }), { headers: H });
    }

    if (a === "leads-my") {
      const agent = url.searchParams.get("agent");
      if (!agent) {
        return new Response(JSON.stringify({ data: [] }), { headers: H });
      }

      const rows = await sql`
        SELECT * FROM leads 
        WHERE grabbed_by = ${agent} 
          AND status NOT IN ('discarded', 'new') 
        ORDER BY created_at DESC`;

      console.log(`leads-my for ${agent}: ${rows.length} leads returned`);
      return new Response(JSON.stringify({ data: rows }), { headers: H });
    }

    if (a === "leads-stats") {
      const rows = await sql`SELECT status, COUNT(*)::int as count FROM leads GROUP BY status`;
      const stats = {};
      for (const r of rows) stats[r.status] = r.count;
      return new Response(JSON.stringify({ data: stats }), { headers: H });
    }

   if (a === "leads-grab") {
  const body = await req.json();
  const rows = await sql`
    UPDATE leads 
    SET status='grabbed', grabbed_by=${body.agent}, grabbed_at=NOW() 
    WHERE id=${body.id} AND status='new' 
    RETURNING *`;
  if (!rows.length) return new Response(JSON.stringify({ error: "Already grabbed" }), { status: 409, headers: H });
  return new Response(JSON.stringify({ data: rows[0] }), { headers: H });
}
      }
      return new Response(JSON.stringify({ data: rows[0] }), { headers: H });
    }

    if (a === "leads-update") {
      const body = await req.json();
      const { id, status, notes, appointment_time } = body;
      if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers: H });

      await sql`
        UPDATE leads 
        SET status = COALESCE(${status||null}, status),
            notes = COALESCE(${notes||null}, notes),
            appointment_time = COALESCE(${appointment_time||null}, appointment_time) 
        WHERE id = ${id}`;
      return new Response(JSON.stringify({ ok: true }), { headers: H });
    }

    if (a === "leads-release") {
      const body = await req.json();
      if (!body.id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers: H });

      await sql`UPDATE leads SET status='new', grabbed_by='', grabbed_at=NULL WHERE id=${body.id}`;
      return new Response(JSON.stringify({ ok: true }), { headers: H });
    }
    // Sales & KPI routes (unchanged)
    if (a === "sales-get" || a === "sales-all" || a === "sales-save" || 
        a === "kpi-get" || a === "kpi-team" || a === "kpi-save") {
      const body = await req.json();

      if (a === "sales-get") {
        const rows = await sql`SELECT data FROM daily_sales WHERE date_key=${body.date}`;
        return new Response(JSON.stringify({ data: rows.length ? rows[0].data : null }), { headers: H });
      }
      if (a === "sales-all") {
        const rows = await sql`SELECT date_key,data FROM daily_sales ORDER BY date_key`;
        const out = {};
        for (const r of rows) out[r.date_key] = r.data;
        return new Response(JSON.stringify({ data: out }), { headers: H });
      }
      if (a === "sales-save") {
        const j = JSON.stringify(body.data);
        await sql`INSERT INTO daily_sales (date_key,data,updated_at) 
          VALUES (${body.date},${j}::jsonb,NOW()) 
          ON CONFLICT (date_key) DO UPDATE SET data=${j}::jsonb, updated_at=NOW()`;
        return new Response(JSON.stringify({ ok: true }), { headers: H });
      }
      if (a === "kpi-save") {
        const { agent_id, date_key, dials, contacts, appointments, quotes, apps_submitted } = body;
        await sql`INSERT INTO kpis (agent_id,date_key,dials,contacts,appointments,quotes,apps_submitted,updated_at)
          VALUES (${agent_id},${date_key},${dials||0},${contacts||0},${appointments||0},${quotes||0},${apps_submitted||0},NOW())
          ON CONFLICT (agent_id,date_key) DO UPDATE SET 
            dials=${dials||0}, contacts=${contacts||0}, appointments=${appointments||0},
            quotes=${quotes||0}, apps_submitted=${apps_submitted||0}, updated_at=NOW()`;
        return new Response(JSON.stringify({ ok: true }), { headers: H });
      }
      if (a === "kpi-get") {
        const rows = await sql`SELECT * FROM kpis WHERE agent_id = ${body.agent || url.searchParams.get("agent")} AND date_key = ${body.date || url.searchParams.get("date")}`;
        return new Response(JSON.stringify({ data: rows[0] || null }), { headers: H });
      }
      if (a === "kpi-team") {
        const rows = await sql`SELECT * FROM kpis WHERE date_key = ${body.date || url.searchParams.get("date")} ORDER BY dials DESC`;
        return new Response(JSON.stringify({ data: rows }), { headers: H });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: H });

  } catch (e) {
    console.error("API Error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: H });
  }
};

export const config = { path: "/.netlify/functions/api" };