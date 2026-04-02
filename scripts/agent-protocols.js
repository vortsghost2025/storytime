/**
 * Emergency Protocol Activator Agent
 * Adapts Deliberate-AI-Ensemble protocol-activator-v2.js for VPS agent system
 * Activates emergency protocols based on medical data analysis
 */

const WebSocket = require("ws");

const GATEWAY_URL = process.env.KILO_GATEWAY || "ws://kilo-gateway:3002";
const AGENT_ID = "protocols";

let ws;
const taskQueue = [];
let isExecuting = false;

// Emergency protocols from protocol-activator-v2.js
const EMERGENCY_PROTOCOLS = {
	dka: {
		name: "Diabetic Ketoacidosis Protocol",
		triggers: ["dka", "diabetic ketoacidosis", "ketoacidosis", "kussmaul"],
		priority: "CRITICAL",
		activationCriteria: {
			bloodGlucose: ">250",
			pH: "<7.35",
			bicarb: "<15",
			anionGap: ">12",
		},
		phases: {
			immediate: [
				"Two large-bore IV lines, aggressive fluid resuscitation",
				"STAT: Serum glucose, VBG/ABG, BMP, BUN/Cr, CBC, ketones",
				"Insulin drip: 0.1 units/kg/hr after K+ >3.5",
				"Cardiac monitoring, continuous pulse oximetry",
				"Insert foley catheter, strict I&Os",
			],
			ongoing: [
				"Recheck glucose q1h initially, then q2-4h",
				"Monitor anion gap closure",
				"Electrolyte repletion (especially potassium)",
				"Transition to subcutaneous insulin when pH >7.3",
			],
			escalation: [
				"ICU admission for severe acidosis (pH <6.9)",
				"Consider CRRT for severe electrolyte derangements",
				"Prepare for possible mechanical ventilation",
			],
		},
	},
	anaphylaxis: {
		name: "Anaphylaxis Protocol",
		triggers: ["anaphylaxis", "anaphylactic shock", "severe allergic", "angioedema", "stridor"],
		priority: "CRITICAL",
		phases: {
			immediate: [
				"Epinephrine 0.3-0.5mg IM (anterolateral thigh)",
				"Call for help, activate rapid response",
				"Large bore IV, aggressive fluid resuscitation",
				"Diphenhydramine 50mg IV",
				"Albuterol nebulizer for bronchospasm",
			],
			ongoing: [
				"Continuous monitoring for 4-12 hours (biphasic reaction)",
				"Repeat epinephrine q5-15min if needed",
				"Consider vasopressors if refractory",
				"H2 blocker (famotidine) for GI symptoms",
			],
			escalation: [
				"Intubation for airway compromise",
				"Vasopressor infusion for refractory shock",
				"ICU admission for severe cases",
			],
		},
	},
	trauma: {
		name: "Trauma Primary Survey",
		triggers: ["trauma", "accident", "injury", "fall", "MVA", "gunshot", "stabbing"],
		priority: "URGENT",
		phases: {
			immediate: [
				"ABCDE assessment (Airway, Breathing, Circulation, Disability, Exposure)",
				"C-spine immobilization if indicated",
				"Two large bore IVs, type and crossmatch",
				"FAST exam for internal bleeding",
				"Control external hemorrhage",
			],
			ongoing: [
				"Secondary survey head-to-toe",
				"Imaging as indicated (X-ray, CT)",
				"Pain management",
				"Tetanus prophylaxis if needed",
			],
			escalation: [
				"OR for life-threatening injuries",
				"Massive transfusion protocol if needed",
				"Trauma surgery consultation",
			],
		},
	},
	pediatricFever: {
		name: "Pediatric Fever Protocol",
		triggers: ["pediatric fever", "child fever", "infant fever", "neonatal fever"],
		priority: "URGENT",
		phases: {
			immediate: [
				"Age-appropriate vital signs assessment",
				"Identify source of fever",
				"Risk stratification for serious bacterial infection",
				"Appropriate antipyretics (acetaminophen/ibuprofen)",
			],
			ongoing: [
				"Monitor for signs of sepsis",
				"Consider blood cultures if <3 months",
				"UA and chest X-ray as indicated",
				"Parental education on return precautions",
			],
			escalation: [
				"Sepsis protocol if concerning signs",
				"LP if meningeal signs",
				"Admission for observation if high risk",
			],
		},
	},
	obstetric: {
		name: "Obstetric Emergency Protocol",
		triggers: [
			"obstetric emergency",
			"pregnancy emergency",
			"eclampsia",
			"placental abruption",
			"shoulder dystocia",
			"cord prolapse",
		],
		priority: "CRITICAL",
		phases: {
			immediate: [
				"Assess maternal and fetal status",
				"Left lateral position, IV access",
				"Continuous fetal monitoring if viable",
				"Prepare for emergent delivery if indicated",
			],
			ongoing: [
				"Magnesium sulfate for eclampsia",
				"Blood products ready",
				"OB and anesthesia notification",
				"Neonatal team standby if preterm",
			],
			escalation: [
				"Emergent C-section for fetal distress",
				"Massive transfusion protocol",
				"ICU admission for maternal instability",
			],
		},
	},
};

function log(msg) {
	console.log("[" + new Date().toISOString() + "] [PROTOCOLS] " + msg);
}

function connect() {
	ws = new WebSocket(GATEWAY_URL + "/" + AGENT_ID);
	ws.on("open", () => {
		log("Connected - Protocol Activator Ready");
		sendMessage({ type: "agent_ready", role: "protocols" });
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

function analyzeForProtocols(content) {
	const lowerContent = content.toLowerCase();
	const activatedProtocols = [];

	for (const [key, protocol] of Object.entries(EMERGENCY_PROTOCOLS)) {
		for (const trigger of protocol.triggers) {
			if (lowerContent.includes(trigger)) {
				activatedProtocols.push({
					id: key,
					name: protocol.name,
					priority: protocol.priority,
					phases: protocol.phases,
					trigger: trigger,
				});
				break;
			}
		}
	}

	return activatedProtocols;
}

function generateProtocolReport(protocols, originalContent) {
	if (protocols.length === 0) {
		return {
			status: "no_protocols_activated",
			message: "No emergency protocols triggered by the provided content",
			timestamp: new Date().toISOString(),
		};
	}

	const report = {
		status: "protocols_activated",
		count: protocols.length,
		protocols: protocols.map((p) => ({
			id: p.id,
			name: p.name,
			priority: p.priority,
			triggeredBy: p.trigger,
			immediateActions: p.phases.immediate,
			ongoingManagement: p.phases.ongoing,
			escalationCriteria: p.phases.escalation,
		})),
		timestamp: new Date().toISOString(),
		originalContent:
			originalContent.substring(0, 200) + (originalContent.length > 200 ? "..." : ""),
	};

	return report;
}

async function processQueue() {
	if (isExecuting || taskQueue.length === 0) return;

	isExecuting = true;
	const task = taskQueue.shift();

	log("Analyzing for protocols: " + (task.message || "").substring(0, 50));

	try {
		const content = task.message || task.prompt || task.data || "";
		const startTime = Date.now();

		const protocols = analyzeForProtocols(content);
		const report = generateProtocolReport(protocols, content);

		sendMessage({
			type: "task_result",
			taskId: task.taskId,
			status: "success",
			output: JSON.stringify(report, null, 2),
			protocolsActivated: protocols.length,
			highestPriority: protocols.length > 0 ? protocols[0].priority : "none",
			executionTime: Date.now() - startTime,
		});

		log("Completed in " + (Date.now() - startTime) + "ms - Protocols: " + protocols.length);
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
