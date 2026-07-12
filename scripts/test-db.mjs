import { config } from "dotenv";
config({ path: ".env.local" });   // WAJIB — baca .env.local dari root
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const { count, error } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true });
if (error) { console.error("DB ERR:", error.message); process.exit(1); }
console.log("OK — documents count =", count);
