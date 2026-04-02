/**
 * WHO Data Fetcher Agent
 * Adapts Deliberate-AI-Ensemble WHO integration for VPS agent system
 * Integrates with WHO surveillance APIs for medical data
 */

const WebSocket = require("ws");
const https = require("https");

const GATEWAY_URL = process.env.KILO_GATEWAY || "ws://kilo-gateway:3002";
const AGENT_ID = "who-data";

let ws;
const taskQueue = [];
let isExecuting = false;

// WHO API configuration
const WHO_CONFIG = {
	apiEndpoint: process.env.WHO_API_ENDPOINT || "https://api.who.int/surveillance",
	apiKey: process.env.WHO_API_KEY || null,
	mockMode: process.env.WHO_MOCK_MODE !== "false",
};

// Mock WHO data for testing
const MOCK_DISEASES = [
	{ id: "COVID-19", name: "COVID-19", severity: "high", region: "global" },
	{ id: "EBOLA", name: "Ebola Virus Disease", severity: "critical", region: "africa" },
	{ id: "MALARIA", name: "Malaria", severity: "moderate", region: "tropical" },
	{ id: "TB", name: "Tuberculosis", severity: "high", region: "global" },
	{ id: "HIV", name: "HIV/AIDS", severity: "high", region: "global" },
	{ id: "INFLUENZA", name: "Influenza", severity: "moderate", region: "global" },
	{ id: "MEASLES", name: "Measles", severity: "moderate", region: "global" },
	{ id: "CHOLERA", name: "Cholera", severity: "high", region: "developing" },
];

const MOCK_OUTBREAKS = [
	{ disease: "COVID-19", location: "Global", cases: 700000000, deaths: 7000000, status: "ongoing" },
	{ disease: "Ebola", location: "DRC", cases: 3500, deaths: 2300, status: "contained" },
	{ disease: "Cholera", location: "Yemen", cases: 2500000, deaths: 4000, status: "ongoing" },
];

function log(msg) {
	console.log("[" + new Date().toISOString() + "] [WHO] " + msg);
}

function connect() {
	ws = new WebSocket(GATEWAY_URL + "/" + AGENT_ID);
	ws.on("open", () => {
		log("Connected - WHO Data Fetcher Ready");
		sendMessage({ type: "agent_ready", role: "who-data" });
	});
	ws.on("message", (data) => {
		try {
			const msg = JSON.parse(data);
			if (msg.type === "task_assignment") {
				taskQueue.push(msg);
				processQueue();
			}
		} catch (e) {}
	});
	ws.on("close", () => setTimeout(connect, 5000));
	ws.on("error", () => {});
}

function sendMessage(msg) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(msg));
	}
}

function fetchMockData(query) {
	const lowerQuery = query.toLowerCase();

	if (lowerQuery.includes("outbreak") || lowerQuery.includes("surveillance")) {
		return {
			type: "outbreaks",
			data: MOCK_OUTBREAKS,
			timestamp: new Date().toISOString(),
			source: "WHO Mock Data",
		};
	}

	if (lowerQuery.includes("disease") || lowerQuery.includes("list")) {
		return {
			type: "diseases",
			data: MOCK_DISEASES,
			timestamp: new Date().toISOString(),
			source: "WHO Mock Data",
		};
	}

	// Search for specific disease
	const matchedDisease = MOCK_DISEASES.find(
		(d) => lowerQuery.includes(d.id.toLowerCase()) || lowerQuery.includes(d.name.toLowerCase()),
	);

	if (matchedDisease) {
		return {
			type: "disease",
			data: matchedDisease,
			timestamp: new Date().toISOString(),
			source: "WHO Mock Data",
		};
	}

	return {
		type: "search",
		data: { query: query, results: MOCK_DISEASES.length + " diseases available" },
		timestamp: new Date().toISOString(),
		source: "WHO Mock Data",
	};
}

function fetchRealData(query) {
	return new Promise((resolve, reject) => {
		const url = WHO_CONFIG.apiEndpoint + "/search?q=" + encodeURIComponent(query);

		https
			.get(
				url,
				{
					headers: {
						Authorization: WHO_CONFIG.apiKey ? "Bearer " + WHO_CONFIG.apiKey : undefined,
						"Content-Type": "application/json",
					},
					timeout: 10000,
				},
				(res) => {
					let data = "";
					res.on("data", (chunk) => (data += chunk));
					res.on("end", () => {
						try {
							resolve(JSON.parse(data));
						} catch (e) {
							resolve({ raw: data, error: "Parse error" });
						}
					});
				},
			)
			.on("error", (e) => {
				reject(e);
			});
	});
}

async function processQueue() {
	if (isExecuting || taskQueue.length === 0) return;

	isExecuting = true;
	const task = taskQueue.shift();

	log("Fetching WHO data: " + (task.message || "").substring(0, 50));

	try {
		const query = task.message || task.prompt || task.query || "diseases";
		const startTime = Date.now();

		let result;
		if (WHO_CONFIG.mockMode) {
			result = fetchMockData(query);
		} else {
			result = await fetchRealData(query);
		}

		sendMessage({
			type: "task_result",
			taskId: task.taskId,
			status: "success",
			output: JSON.stringify(result, null, 2),
			dataType: result.type,
			executionTime: Date.now() - startTime,
		});

		log("Completed in " + (Date.now() - startTime) + "ms - Type: " + result.type);
	} catch (e) {
		sendMessage({
			type: "task_result",
			taskId: task.taskId,
			status: "failed",
			error: e.message,
		});
	}

	isExecuting = false;
	setImmediate(processQueue);
}

setInterval(() => {
	if (ws && ws.readyState === WebSocket.OPEN) {
		sendMessage({ type: "heartbeat" });
	}
}, 30000);

connect();
