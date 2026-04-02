/**
 * Medical Pipeline Agent
 * Adapts Deliberate-AI-Ensemble medical module for VPS agent system
 * 5-Agent Pipeline: Ingestion → Triage → Summarization → Risk → Output
 */

const WebSocket = require("ws");
const http = require("http");

const GATEWAY_URL = process.env.KILO_GATEWAY || "ws://kilo-gateway:3002";
const AGENT_ID = "medical-pipeline";

let ws;
const taskQueue = [];
let isExecuting = false;

// Classification keywords (200+ terms from original module)
const CLASSIFICATION_KEYWORDS = {
	symptoms: [
		"pain",
		"ache",
		"fever",
		"cough",
		"nausea",
		"headache",
		"dizziness",
		"fatigue",
		"weakness",
		"vomiting",
		"diarrhea",
		"rash",
		"swelling",
		"numbness",
		"tingling",
		"chest pain",
		"shortness of breath",
		"syncope",
		"palpitations",
		"confusion",
		"seizure",
		"paralysis",
		"bleeding",
	],
	labResults: [
		"lab",
		"test",
		"CBC",
		"glucose",
		"troponin",
		"hemoglobin",
		"creatinine",
		"BUN",
		"electrolytes",
		"sodium",
		"potassium",
		"calcium",
		"magnesium",
		"liver function",
		"LFT",
		"renal function",
		"urinalysis",
		"blood gas",
		"ABG",
		"VBG",
		"coagulation",
		"INR",
		"PT",
		"PTT",
		"D-dimer",
	],
	imaging: [
		"x-ray",
		"CT",
		"MRI",
		"ultrasound",
		"impression",
		"findings",
		"radiology",
		"scan",
		"contrast",
		"enhancement",
		"opacity",
		"mass",
		"fracture",
		"dislocation",
		"effusion",
		"pneumothorax",
		"consolidation",
	],
	vitalSigns: [
		"BP",
		"heart rate",
		"temperature",
		"SpO2",
		"vitals",
		"pulse",
		"respiratory rate",
		"RR",
		"O2 sat",
		"oxygen saturation",
		"MAP",
		"blood pressure",
		"systolic",
		"diastolic",
		"mean arterial",
	],
	clinicalNotes: [
		"note",
		"admission",
		"discharge",
		"assessment",
		"plan",
		"H&P",
		"history and physical",
		"progress note",
		"consult",
		"procedure",
		"operative",
		"pathology",
		"radiology report",
		"discharge summary",
	],
};

// Emergency protocols (from protocol-activator-v2.js)
const EMERGENCY_PROTOCOLS = {
	dka: {
		name: "Diabetic Ketoacidosis",
		triggers: ["dka", "diabetic ketoacidosis", "ketoacidosis"],
		priority: "CRITICAL",
		actions: [
			"Two large-bore IV lines, aggressive fluid resuscitation",
			"STAT: Serum glucose, VBG/ABG, BMP, BUN/Cr, CBC, ketones",
			"Insulin drip: 0.1 units/kg/hr after K+ >3.5",
			"Cardiac monitoring, continuous pulse oximetry",
		],
	},
	anaphylaxis: {
		name: "Anaphylaxis",
		triggers: ["anaphylaxis", "anaphylactic shock", "severe allergic"],
		priority: "CRITICAL",
		actions: [
			"Epinephrine 0.3-0.5mg IM immediately",
			"Large bore IV, aggressive fluid resuscitation",
			"Diphenhydramine 50mg IV, Albuterol nebulizer",
			"Monitor for biphasic reaction (4-12 hours)",
		],
	},
	trauma: {
		name: "Trauma Primary Survey",
		triggers: ["trauma", "accident", "injury", "fall", "MVA"],
		priority: "URGENT",
		actions: [
			"ABCDE assessment (Airway, Breathing, Circulation, Disability, Exposure)",
			"C-spine immobilization if indicated",
			"Two large bore IVs, type and crossmatch",
			"FAST exam for internal bleeding",
		],
	},
	pediatricFever: {
		name: "Pediatric Fever",
		triggers: ["pediatric fever", "child fever", "infant fever"],
		priority: "URGENT",
		actions: [
			"Age-appropriate vital signs assessment",
			"Identify source of fever",
			"Risk stratification for serious bacterial infection",
			"Appropriate antipyretics based on age",
		],
	},
	obstetric: {
		name: "Obstetric Emergency",
		triggers: ["obstetric emergency", "pregnancy emergency", "eclampsia", "placental abruption"],
		priority: "CRITICAL",
		actions: [
			"Assess maternal and fetal status",
			"Left lateral position, IV access",
			"Continuous fetal monitoring if viable",
			"Prepare for emergent delivery if indicated",
		],
	},
};

function log(msg) {
	console.log("[" + new Date().toISOString() + "] [MEDICAL] " + msg);
}

function connect() {
	ws = new WebSocket(GATEWAY_URL + "/" + AGENT_ID);
	ws.on("open", () => {
		log("Connected - Medical Pipeline Ready");
		sendMessage({ type: "agent_ready", role: "medical-pipeline" });
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

// 5-Agent Pipeline Functions
function ingestData(rawData) {
	const startTime = Date.now();
	const content = typeof rawData === "string" ? rawData : JSON.stringify(rawData);
	const wordCount = content.split(/\s+/).length;

	return {
		normalized: {
			content: content,
			wordCount: wordCount,
			hasStructure: typeof rawData === "object",
			timestamp: new Date().toISOString(),
		},
		metadata: {
			ingestionTime: Date.now() - startTime,
			source: "medical-pipeline",
		},
	};
}

function triageData(normalized) {
	const content = normalized.content.toLowerCase();
	const scores = {};

	for (const [type, keywords] of Object.entries(CLASSIFICATION_KEYWORDS)) {
		const matches = keywords.filter((kw) => content.includes(kw.toLowerCase()));
		scores[type] = {
			score: matches.length / keywords.length,
			matches: matches,
			confidence: Math.min(1, matches.length / 3),
		};
	}

	let bestType = "other";
	let bestScore = 0;

	for (const [type, data] of Object.entries(scores)) {
		if (data.score > bestScore) {
			bestScore = data.score;
			bestType = type;
		}
	}

	return {
		type: bestType,
		confidence: scores[bestType]?.confidence || 0,
		scores: scores,
		indicators: scores[bestType]?.matches || [],
	};
}

function summarizeData(normalized, classification) {
	const fields = [];

	switch (classification.type) {
		case "symptoms":
			fields.push("reportedItems", "severity", "onset", "duration");
			break;
		case "labResults":
			fields.push("testName", "results", "referenceRange", "abnormalFlag");
			break;
		case "imaging":
			fields.push("studyType", "bodyRegion", "findings", "impression");
			break;
		case "vitalSigns":
			fields.push("measurements", "trendSummary");
			break;
		case "clinicalNotes":
			fields.push("noteType", "chiefComplaint", "assessment", "plan");
			break;
	}

	return {
		fields: fields,
		extractionMethod: "keyword-based",
		completeness: fields.length > 0 ? 0.8 : 0.2,
		summary:
			"Classified as " +
			classification.type +
			" with " +
			(classification.confidence * 100).toFixed(0) +
			"% confidence",
	};
}

function assessRisk(classification, summary) {
	const riskFactors = [];
	let riskScore = 0;

	if (classification.confidence < 0.5) {
		riskFactors.push("Low classification confidence");
		riskScore += 20;
	}

	const content = classification.indicators.join(" ").toLowerCase();
	for (const [protocol, data] of Object.entries(EMERGENCY_PROTOCOLS)) {
		for (const trigger of data.triggers) {
			if (content.includes(trigger)) {
				riskFactors.push("Emergency protocol triggered: " + data.name);
				riskScore += data.priority === "CRITICAL" ? 40 : 20;
			}
		}
	}

	if (summary.completeness < 0.5) {
		riskFactors.push("Incomplete data extraction");
		riskScore += 10;
	}

	return {
		score: Math.min(100, riskScore),
		severity: riskScore >= 40 ? "critical" : riskScore >= 20 ? "elevated" : "low",
		factors: riskFactors,
		flags: riskScore >= 40 ? ["REQUIRES_IMMEDIATE_REVIEW"] : [],
	};
}

function checkEmergencyProtocols(content) {
	const protocols = [];
	const lowerContent = content.toLowerCase();

	for (const [key, protocol] of Object.entries(EMERGENCY_PROTOCOLS)) {
		for (const trigger of protocol.triggers) {
			if (lowerContent.includes(trigger)) {
				protocols.push({
					id: key,
					name: protocol.name,
					priority: protocol.priority,
					actions: protocol.actions,
				});
				break;
			}
		}
	}

	return protocols;
}

async function processQueue() {
	if (isExecuting || taskQueue.length === 0) return;

	isExecuting = true;
	const task = taskQueue.shift();

	log("Processing medical data: " + (task.message || "").substring(0, 50));

	try {
		const rawData = task.message || task.prompt || task.data || "No data provided";
		const startTime = Date.now();

		const ingestion = ingestData(rawData);
		const classification = triageData(ingestion.normalized);
		const summary = summarizeData(ingestion.normalized, classification);
		const risk = assessRisk(classification, summary);

		const output = {
			classification: {
				type: classification.type,
				confidence: classification.confidence,
				indicators: classification.indicators,
			},
			summary: summary,
			riskScore: {
				score: risk.score,
				severity: risk.severity,
				factors: risk.factors,
				flags: risk.flags,
			},
			metadata: {
				processingTime: Date.now() - startTime,
				timestamp: new Date().toISOString(),
				pipeline: "5-agent-medical",
			},
		};

		const protocols = checkEmergencyProtocols(rawData);
		if (protocols.length > 0) {
			output.emergencyProtocols = protocols;
		}

		const executionTime = Date.now() - startTime;

		sendMessage({
			type: "task_result",
			taskId: task.taskId,
			status: "success",
			output: JSON.stringify(output, null, 2),
			classification: classification.type,
			risk: risk.severity,
			executionTime: executionTime,
		});

		log(
			"Completed in " +
				executionTime +
				"ms - Type: " +
				classification.type +
				" Risk: " +
				risk.severity,
		);
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
