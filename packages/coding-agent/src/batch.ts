import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AgentSession, AgentSessionEvent, PromptOptions } from "./core/agent-session.js";
import { type CreateAgentSessionOptions, type CreateAgentSessionResult, createAgentSession } from "./core/sdk.js";

export type BatchEventHandler = (event: AgentSessionEvent, session: AgentSession) => Promise<void> | void;

export type BatchHook = (session: AgentSession) => Promise<void> | void;

export interface CreateBatchSessionOptions extends CreateAgentSessionOptions {
	onEvent?: BatchEventHandler;
}

export interface RunBatchOptions {
	prompt: string;
	promptOptions?: PromptOptions;
	beforePrompt?: BatchHook;
	beforeFinish?: BatchHook;
}

export interface RunBatchSessionOptions extends CreateBatchSessionOptions, RunBatchOptions {}

export interface BatchRunResult {
	session: AgentSession;
	messages: AgentMessage[];
	response: string;
}

export interface CreateBatchSessionResult extends CreateAgentSessionResult {
	run(options: RunBatchOptions): Promise<BatchRunResult>;
}

export async function createBatchSession(options: CreateBatchSessionOptions = {}): Promise<CreateBatchSessionResult> {
	const { onEvent, ...sessionOptions } = options;
	const created = await createAgentSession(sessionOptions);

	if (onEvent) {
		created.session.subscribe((event) => {
			try {
				const result = onEvent(event, created.session);
				if (result && typeof (result as Promise<void>).catch === "function") {
					void (result as Promise<void>).catch(() => {});
				}
			} catch {}
		});
	}

	return {
		...created,
		run: async (runOptions) => runBatchPrompt(created.session, runOptions),
	};
}

export async function runBatchSession(options: RunBatchSessionOptions): Promise<BatchRunResult> {
	const { prompt, promptOptions, beforePrompt, beforeFinish, ...sessionOptions } = options;
	const created = await createBatchSession(sessionOptions);
	return runBatchPrompt(created.session, {
		prompt,
		promptOptions,
		beforePrompt,
		beforeFinish,
	});
}

async function runBatchPrompt(session: AgentSession, options: RunBatchOptions): Promise<BatchRunResult> {
	await options.beforePrompt?.(session);
	await session.prompt(options.prompt, options.promptOptions);
	await options.beforeFinish?.(session);
	return {
		session,
		messages: session.messages,
		response: extractFinalAssistantText(session.messages),
	};
}

function extractFinalAssistantText(messages: AgentMessage[]): string {
	const assistant = [...messages].reverse().find((message) => message.role === "assistant");
	return assistant ? extractMessageText(assistant) : "";
}

function extractMessageText(message: AgentMessage): string {
	if (!Array.isArray((message as { content?: unknown }).content)) {
		return "";
	}

	return (message as { content: Array<{ type?: string; text?: string }> }).content
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text ?? "")
		.join("\n");
}
