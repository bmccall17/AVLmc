import { query } from "./lib/db";
query("select id, image_url from events where image_url is not null limit 10").then(r => console.log(r.rows)).catch(console.error);
