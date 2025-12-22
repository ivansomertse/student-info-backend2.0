// server.js
// Student Information System + AI Chat with JSON persistence

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// ----- CORS: allow local and deployed frontend -----
app.use(
  cors({
    origin: [
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "http://localhost:3000",
      "https://student-info-system.vercel.app"
    ],
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  })
);

// ----- JSON persistence -----
const STUDENTS_FILE = "students.json";
let students = [];

function loadStudents() {
  try {
    const data = fs.readFileSync(STUDENTS_FILE, "utf8");
    students = JSON.parse(data);
    console.log(`✅ Loaded ${students.length} students`);
  } catch {
    students = [];
    console.warn("⚠️ No students.json found, starting empty.");
  }
}

function saveStudents() {
  fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2));
}

loadStudents();

// ----- Check API key -----
if (!process.env.OPENROUTER_API_KEY) {
  console.warn("⚠️ OPENROUTER_API_KEY is NOT set.");
} else {
  console.log("✅ OPENROUTER_API_KEY is loaded.");
}

// ----- Health check -----
app.get("/", (_req, res) => {
  res.json({ success: true, status: "ok", service: "student-backend", time: new Date().toISOString() });
});

// ----- Student CRUD -----
app.get("/students", (_req, res) => res.json(students));

app.post("/students", (req, res) => {
  const { studentID, fullName, program, yearLevel, gender, gmail, university } = req.body;
  if (!studentID || !fullName) {
    return res.status(400).json({ success: false, error: "studentID and fullName required." });
  }
  if (students.some((s) => s.studentID === studentID)) {
    return res.status(409).json({ success: false, error: "Duplicate ID." });
  }

  const student = { studentID, fullName, program, yearLevel, gender, gmail, university };
  students.push(student);
  saveStudents();
  res.status(201).json({ success: true, student });
});

app.delete("/students/:id", (req, res) => {
  const index = students.findIndex((s) => s.studentID === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: "Student not found." });
  }
  const removed = students.splice(index, 1)[0];
  saveStudents();
  res.json({ success: true, removed });
});

// ----- AI Chat -----
app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    console.log("❌ No message received.");
    return res.status(400).json({ success: false, error: "Message required." });
  }

  const studentSummary = JSON.stringify(students.slice(0, 200));
  const systemPrompt = `You are an assistant for a Student Information System. Use this data:\n${studentSummary}`;

  try {
    const orKey = process.env.OPENROUTER_API_KEY;
    if (!orKey) {
      console.log("❌ API key missing.");
      return res.status(500).json({ success: false, error: "OPENROUTER_API_KEY is not set." });
    }

    console.log("📤 Sending request to OpenRouter...");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${orKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5500",
        "X-Title": "Student Info Chat",
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo", // ✅ more reliable than mistral
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.2,
      }),
    });

    const data = await response.json();
    console.log("📥 Response from OpenRouter:", data);

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!response.ok || !content) {
      console.warn("⚠️ AI returned empty or error response.");
      return res.status(response.status || 502).json({
        success: false,
        error: data?.error?.message || "AI returned no response.",
      });
    }

    res.json({ success: true, message: content });
  } catch (err) {
    console.error("❌ Chat error:", err);
    res.status(500).json({ success: false, error: "Server error communicating with AI." });
  }
});

// ----- 404 -----
app.use((_req, res) => res.status(404).json({ success: false, error: "Not Found" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
