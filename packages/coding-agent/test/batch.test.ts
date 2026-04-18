import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "../src/core/agent-session.js";

const { createAgentSession } = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
}));

vi.mock("../src/core/sdk.js", () => ({
	createAgentSession,
}));

import { createBatchSession, runBatchSession } from "../src/batch.js";

describe("batch session helpers", () => {
	let session: {
		messages: Array<Record<string, unknown>>;
		prompt: ReturnType<typeof vi.fn>;
		subscribe: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		session = {
			messages: [],
			prompt: vi.fn(async () => {
				session.messages = [
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "private" },
							{ type: "text", text: "hello" },
							{ type: "text", text: "world" },
						],
					},
				];
			}),
			subscribe: vi.fn(),
		};

		createAgentSession.mockReset();
		createAgentSession.mockResolvedValue({
			session,
			extensionsResult: { extensions: [], errors: [], runtime: {} },
			modelFallbackMessage: undefined,
		});
	});

	it("runs a prompt and returns the final assistant text", async () => {
		const beforePrompt = vi.fn();
		const beforeFinish = vi.fn();

		const result = await runBatchSession({
			cwd: "/tmp/project",
			prompt: "test prompt",
			beforePrompt,
			beforeFinish,
		});

		expect(createAgentSession).toHaveBeenCalledWith({ cwd: "/tmp/project" });
		expect(beforePrompt).toHaveBeenCalledWith(session);
		expect(session.prompt).toHaveBeenCalledWith("test prompt", undefined);
		expect(beforeFinish).toHaveBeenCalledWith(session);
		expect(result.session).toBe(session);
		expect(result.messages).toBe(session.messages);
		expect(result.response).toBe("hello\nworld");
	});

	it("subscribes to session events when an event handler is provided", async () => {
		let listener: ((event: AgentSessionEvent) => void) | undefined;
		session.subscribe.mockImplementation((nextListener) => {
			listener = nextListener;
			return () => {};
		});
		const onEvent = vi.fn();

		await createBatchSession({
			cwd: "/tmp/project",
			onEvent,
		});
		listener?.({ type: "agent_start" });

		expect(onEvent).toHaveBeenCalledWith({ type: "agent_start" }, session);
	});

	it("forwards generic tool hooks to createAgentSession", async () => {
		const beforeToolCall = vi.fn();
		const afterToolCall = vi.fn();

		await createBatchSession({
			cwd: "/tmp/project",
			beforeToolCall,
			afterToolCall,
		});

		expect(createAgentSession).toHaveBeenCalledWith({
			cwd: "/tmp/project",
			beforeToolCall,
			afterToolCall,
		});
	});
});
