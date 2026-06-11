import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ─── MCP tools ────────────────────────────────────────────────────────────────

const mathServer = createSdkMcpServer({
  name: "math",
  version: "1.0.0",
  tools: [
    tool(
      "add_numbers",
      "Adds two numbers together",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => {
        console.log(`   🔧 [TOOL]     add_numbers(${a}, ${b}) → ${a + b}`);
        return { content: [{ type: "text", text: `${a + b}` }] };
      }
    ),
    tool(
      "multiply_numbers",
      "Multiplies two numbers together",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => {
        console.log(`   🔧 [TOOL]     multiply_numbers(${a}, ${b}) → ${a * b}`);
        return { content: [{ type: "text", text: `${a * b}` }] };
      }
    )
  ]
});

// ─── Agent ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Starting agent...\n");

  for await (const msg of query({
    prompt: `
      You MUST use the calculator subagent for all math — do not compute anything yourself.
      Use the calculator agent to:
      1. Add 12 and 8
      2. Multiply that result by 5
      Report the final answer.
    `,
    options: {
      // ✅ "Task" is the correct built-in tool name for spawning subagents
      allowedTools: ["Task", "mcp__math__add_numbers", "mcp__math__multiply_numbers"],
      mcpServers: { math: mathServer },

      agents: {
        calculator: {
          description: "Use this agent for ALL arithmetic: addition, multiplication, any math operations",
          prompt: "You are a calculator. Use your tools for every calculation. Never compute mentally.",
          tools: ["mcp__math__add_numbers", "mcp__math__multiply_numbers"],
          mcpServers: { math: mathServer },
          model: "haiku",
          maxTurns: 5,
        }
      }
    }
  })) {

    switch (msg.type) {
      case "system":
        console.log(`⚙️  [SYSTEM]    ${msg.subtype}`);
        break;

      case "assistant":
        for (const block of msg.message.content) {
            console.log("[BLOCK_NAME] ", block.name);
            if (block.type === "tool_use" && block.name === "Agent") {
                console.log("📤 Prompt sent to subagent:");
                console.log(block.input.prompt); // ← Claude wrote this
              }
          if (block.type === "text") {
            console.log(`🤖 [ASSISTANT] ${block.text.trim().slice(0, 120)}`);
          } else if (block.type === "tool_use") {
            console.log(`🔨 [TOOL_USE]  ${block.name}`);
            console.log(`               ${JSON.stringify(block.input)}`);
          }
        }
        break;

      case "user":
        for (const block of msg.message.content) {
          if (block.type === "tool_result") {
            const text = Array.isArray(block.content)
              ? block.content.map(c => c.text).join("")
              : block.content;
            console.log(`📨 [TOOL_RESULT] ${text}`);
          }
        }
        break;

      case "result":
        console.log(`\n${"─".repeat(50)}`);
        if (msg.subtype === "success") {
          console.log(`✅ [RESULT]\n${msg.result}`);
        } else {
          console.log(`❌ [ERROR] ${msg.subtype}`);
        }
        break;
    }
  }
}

main().catch(console.error);