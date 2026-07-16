#!/usr/bin/env bun
/**
 * Antigravity OAuth token generator for omp.
 *
 * Implements the same Google OAuth flow as packages/ai/src/registry/oauth/google-antigravity.ts
 * but as a standalone Bun script that can be invoked from models.yml as:
 *   apiKey: "!bun /Users/joe/.omp/agent/scripts/omp-antigravity-auth.ts"
 */

import { homedir } from "os";
import { join } from "path";
import * as readline from "readline";

const revDecode = (s: string) => atob(s.split("").reverse().join(""));
const CLIENT_ID = revDecode("==QbvNmL05WZ052bjJXZzVXZsd2bvdmLzBHch5CclNDM0cGNop2bs9Gd2VzMyUmcjxWMygmMul2czhWb01SM5UDM2AjNwATM3ATM");
const CLIENT_SECRET = revDecode("=YWQEFnN6RzQYNHOCxUbxoETkxkN4QjUXZEO1sULYB1UD90R");
const CALLBACK_PORT = 51121;
const CALLBACK_PATH = "/oauth-callback";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";
const CLOUD_CODE_ENDPOINT = "https://cloudcode-pa.googleapis.com";

const SCOPES = [
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
	"https://www.googleapis.com/auth/cclog",
	"https://www.googleapis.com/auth/experimentsandconfigs",
].join(" ");

const TIER_LEGACY = "legacy-tier";
const CACHE_PATH = join(homedir(), ".cache", "omp-antigravity-auth.json");

type ProjectIdValue = string | { id?: string } | undefined;

interface Cache {
	apiEndpoint: string;
	token: string;
	enterpriseUrl: string;
	projectId: string;
	refreshToken: string;
	expiresAt: number;
	email: string;
	accountId: string;
}

function getUserAgent(): string {
	const version = "2.1.4";
	let os = process.platform;
	if (os === "win32") os = "windows";
	let arch = process.arch;
	if (arch === "x64") arch = "amd64";
	else if (arch === "ia32") arch = "386";
	return `antigravity/hub/${version} ${os}/${arch}`;
}

async function readCache(): Promise<Cache | null> {
	try {
		const text = await Bun.file(CACHE_PATH).text();
		return JSON.parse(text) as Cache;
	} catch {
		return null;
	}
}

async function writeCache(cache: Cache): Promise<void> {
	await Bun.write(CACHE_PATH, JSON.stringify(cache, null, 2));
	try {
		await Bun.spawn(["chmod", "600", CACHE_PATH]).exited;
	} catch {
		// ignore
	}
}

async function fetchJson(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
	const resp = await fetch(input, init);
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`HTTP ${resp.status}: ${text}`);
	}
	return resp.json();
}

async function getUserEmail(accessToken: string): Promise<string | undefined> {
	try {
		const data = (await fetchJson(USERINFO_URL, {
			headers: { Authorization: `Bearer ${accessToken}` },
		})) as { email?: string };
		return typeof data.email === "string" ? data.email : undefined;
	} catch {
		return undefined;
	}
}

function readProjectId(value: ProjectIdValue): string | undefined {
	if (typeof value === "string" && value.length > 0) {
		return value;
	}
	if (value && typeof value === "object" && typeof value.id === "string" && value.id.length > 0) {
		return value.id;
	}
	return undefined;
}

function getDefaultTierId(allowedTiers?: Array<{ id?: string; isDefault?: boolean }>): string {
	if (!allowedTiers || allowedTiers.length === 0) {
		return TIER_LEGACY;
	}
	const defaultTier = allowedTiers.find(
		tier => tier.isDefault && typeof tier.id === "string" && tier.id.length > 0,
	);
	return defaultTier?.id || TIER_LEGACY;
}

async function discoverProject(accessToken: string): Promise<string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "application/json",
		"User-Agent": getUserAgent(),
	};
	const metadata = {
		ideType: "ANTIGRAVITY",
		platform: "PLATFORM_UNSPECIFIED",
		pluginType: "GEMINI",
	};

	const loadData = (await fetchJson(`${CLOUD_CODE_ENDPOINT}/v1internal:loadCodeAssist`, {
		method: "POST",
		headers,
		body: JSON.stringify({ metadata }),
	})) as {
		cloudaicompanionProject?: ProjectIdValue;
		allowedTiers?: Array<{ id?: string; isDefault?: boolean }>;
	};

	const existing = readProjectId(loadData.cloudaicompanionProject);
	if (existing) {
		return existing;
	}

	const tierId = getDefaultTierId(loadData.allowedTiers);
	const onboardBody = { tierId, metadata };
	for (let attempt = 1; attempt <= 5; attempt++) {
		const op = (await fetchJson(`${CLOUD_CODE_ENDPOINT}/v1internal:onboardUser`, {
			method: "POST",
			headers,
			body: JSON.stringify(onboardBody),
		})) as {
			done?: boolean;
			response?: { cloudaicompanionProject?: ProjectIdValue };
		};
		if (op.done) {
			const pid = readProjectId(op.response?.cloudaicompanionProject);
			if (pid) {
				return pid;
			}
		}
		if (attempt < 5) {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 2000);
			await promise;
		}
	}
	throw new Error("Could not discover or provision an Antigravity project after 5 attempts");
}

async function refreshCache(cache: Cache): Promise<Cache> {
	const resp = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			refresh_token: cache.refreshToken,
			grant_type: "refresh_token",
		}),
	});
	if (!resp.ok) {
		const err = await resp.text();
		throw new Error(`Token refresh failed: ${resp.status} ${err}`);
	}
	const data = (await resp.json()) as {
		access_token: string;
		expires_in: number;
		refresh_token?: string;
	};
	const accessToken = data.access_token;
	const expiresAt = Date.now() + data.expires_in * 1000 - 5 * 60 * 1000;

	const [email, projectId] = await Promise.all([
		getUserEmail(accessToken),
		discoverProject(accessToken),
	]);

	const updated: Cache = {
		apiEndpoint: "",
		token: accessToken,
		enterpriseUrl: "",
		projectId,
		refreshToken: data.refresh_token || cache.refreshToken,
		expiresAt,
		email: email || cache.email || "",
		accountId: "",
	};
	await writeCache(updated);
	return updated;
}

function parseCallbackInput(input: string): { code?: string; state?: string } {
	const value = input.trim();
	if (!value) {
		return {};
	}
	try {
		const url = new URL(value);
		return {
			code: url.searchParams.get("code") ?? undefined,
			state: url.searchParams.get("state") ?? undefined,
		};
	} catch {
		// not a full URL
	}
	if (value.includes("code=")) {
		const params = new URLSearchParams(value.replace(/^[?#]/, ""));
		return {
			code: params.get("code") ?? undefined,
			state: params.get("state") ?? undefined,
		};
	}
	const [code, state] = value.split("#", 2);
	return { code, state };
}

async function readPastedCode(promptText: string): Promise<string> {
	console.error(promptText);
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		const it = rl[Symbol.asyncIterator]();
		const { value } = await it.next();
		return typeof value === "string" ? value : "";
	} finally {
		rl.close();
	}
}

interface ServerHandle {
	port: number;
	redirectUri: string;
	waitForCode: () => Promise<string>;
}

async function startCallbackServer(expectedState: string): Promise<ServerHandle> {
	let code: string | undefined;
	let error: string | undefined;

	function fetchHandler(this: Bun.Server, req: Request): Response {
		const url = new URL(req.url);
		if (url.pathname !== CALLBACK_PATH) {
			return new Response("Not Found", { status: 404 });
		}
		const params = url.searchParams;
		const err = params.get("error");
		if (err) {
			error = err;
			this.stop();
			return new Response(`Authorization error: ${err}`, {
				status: 500,
				headers: { "Content-Type": "text/plain" },
			});
		}
		const c = params.get("code");
		const s = params.get("state") || "";
		if (!c) {
			return new Response("Missing authorization code", { status: 400 });
		}
		if (expectedState && s !== expectedState) {
			return new Response("State mismatch", { status: 400 });
		}
		code = c;
		this.stop();
		return new Response(
			"<html><body><h1>Success</h1><p>You can close this tab.</p></body></html>",
			{ status: 200, headers: { "Content-Type": "text/html" } },
		);
	}

	let server: Bun.Server;
	let port = CALLBACK_PORT;
	try {
		server = Bun.serve({ hostname: "127.0.0.1", port: CALLBACK_PORT, fetch: fetchHandler });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes("EADDRINUSE") || msg.includes("in use") || msg.includes("bind") || msg.includes("port")) {
			server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: fetchHandler });
			port = server.port;
		} else {
			throw e;
		}
	}

	const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

	const waitForCode = async (): Promise<string> => {
		while (!code && !error) {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 50);
			await promise;
		}
		try {
			server.stop();
		} catch {
			// ignore
		}
		if (error) {
			throw new Error(`Authorization error: ${error}`);
		}
		if (!code) {
			throw new Error("No authorization code received");
		}
		return code;
	};

	return { port, redirectUri, waitForCode };
}

async function exchangeCode(code: string, redirectUri: string): Promise<Cache> {
	const resp = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			code,
			grant_type: "authorization_code",
			redirect_uri: redirectUri,
		}),
	});
	if (!resp.ok) {
		const err = await resp.text();
		throw new Error(`Token exchange failed: ${resp.status} ${err}`);
	}
	const data = (await resp.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	const accessToken = data.access_token;
	const expiresAt = Date.now() + data.expires_in * 1000 - 5 * 60 * 1000;

	const [email, projectId] = await Promise.all([
		getUserEmail(accessToken),
		discoverProject(accessToken),
	]);

	const cache: Cache = {
		apiEndpoint: "",
		token: accessToken,
		enterpriseUrl: "",
		projectId,
		refreshToken: data.refresh_token,
		expiresAt,
		email: email || "",
		accountId: "",
	};
	await writeCache(cache);
	return cache;
}

async function doInteractiveAuth(): Promise<Cache> {
	const state = crypto.randomUUID().replace(/-/g, "");
	let redirectUri: string;
	let code: string;

	try {
		const handle = await startCallbackServer(state);
		redirectUri = handle.redirectUri;
		const authParams = new URLSearchParams({
			client_id: CLIENT_ID,
			response_type: "code",
			redirect_uri: redirectUri,
			scope: SCOPES,
			state,
			access_type: "offline",
			prompt: "consent",
		});
		const authUrl = `${AUTH_URL}?${authParams.toString()}`;
		console.error("Open this URL in your browser and authorize:");
		console.error(authUrl);
		code = await handle.waitForCode();
	} catch {
		console.error("Could not use local callback server, falling back to manual paste.");
		redirectUri = `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`;
		const authParams = new URLSearchParams({
			client_id: CLIENT_ID,
			response_type: "code",
			redirect_uri: redirectUri,
			scope: SCOPES,
			state,
			access_type: "offline",
			prompt: "consent",
		});
		const authUrl = `${AUTH_URL}?${authParams.toString()}`;
		console.error("Open this URL in your browser and authorize:");
		console.error(authUrl);
		const input = await readPastedCode("Paste the redirect URL or authorization code here:");
		const parsed = parseCallbackInput(input);
		if (!parsed.code) {
			throw new Error("No authorization code provided");
		}
		if (parsed.state && parsed.state !== state) {
			throw new Error("State mismatch in pasted callback");
		}
		code = parsed.code;
	}

	return exchangeCode(code, redirectUri);
}

async function main(): Promise<void> {
	let cache = await readCache();
	if (cache && cache.expiresAt > Date.now() + 60_000) {
		console.log(JSON.stringify(cache));
		return;
	}

	if (cache && cache.refreshToken) {
		try {
			const refreshed = await refreshCache(cache);
			console.log(JSON.stringify(refreshed));
			return;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error(`Refresh failed, falling back to interactive auth: ${msg}`);
		}
	}

	if (!process.stdin.isTTY) {
		console.error(
			"No cached Antigravity credentials and not running interactively. " +
				"Run `bun ~/.omp/agent/scripts/omp-antigravity-auth.ts` in a terminal to authenticate.",
		);
		process.exit(1);
	}

	const newCache = await doInteractiveAuth();
	console.log(JSON.stringify(newCache));
}

main().catch(e => {
	console.error(e instanceof Error ? e.message : String(e));
	process.exit(1);
});
