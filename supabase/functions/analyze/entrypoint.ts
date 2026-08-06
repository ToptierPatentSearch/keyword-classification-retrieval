// Pin the production analyze function to the current GPT-5.6 flagship alias.
// This assignment happens before index.ts is evaluated, so an older
// OPENAI_MODEL project secret cannot silently keep the function on a previous
// model after deployment.
Deno.env.set("OPENAI_MODEL", "gpt-5.6");

await import("./index.ts");
