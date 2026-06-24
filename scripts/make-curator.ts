import "server-only";
import { query } from "../lib/db";
import { randomUUID } from "node:crypto";

async function makeCurator(email: string) {
  try {
    const result = await query("SELECT id FROM public.users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      console.error("User not found with email:", email);
      process.exit(1);
    }
    const userId = result.rows[0].id;
    const handle = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    
    await query(`
      INSERT INTO public.curators (id, user_id, handle, display_name, status, promoted_by_admin)
      VALUES ($1, $2, $3, $4, 'active', true)
      ON CONFLICT (user_id) DO UPDATE SET status = 'active'
    `, [randomUUID(), userId, handle, handle]);
    
    console.log(`Successfully made ${email} a curator with handle @${handle}`);
    process.exit(0);
  } catch (err) {
    console.error("Failed to make curator:", err);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/make-curator.ts <email>");
  process.exit(1);
}

void makeCurator(email);
