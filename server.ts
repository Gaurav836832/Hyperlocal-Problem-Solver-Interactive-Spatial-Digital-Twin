import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "community-sentinel-secret-key-2026";

const app = express();
const PORT = 3000;

// Initialize Gemini SDK with User-Agent telemetry
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Configure JSON parser with larger limit for base64 images
app.use(express.json({ limit: '15mb' }));

// Paths
const DATA_DIR = path.join(process.cwd(), "data");
const ISSUES_FILE = path.join(DATA_DIR, "issues.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatar: string;
  xp: number;
  badge: string;
  createdAt: string;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to load users
const loadUsers = (): UserRecord[] => {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      // Seed a default test citizen
      const seedUser: UserRecord = {
        id: "user-default",
        name: "Citizen Hero",
        email: "hero@community.org",
        passwordHash: bcrypt.hashSync("password123", 10),
        avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=CitizenHero",
        xp: 250,
        badge: "Vigilant Defender",
        createdAt: new Date().toISOString()
      };
      fs.writeFileSync(USERS_FILE, JSON.stringify([seedUser], null, 2));
      return [seedUser];
    }
    const data = fs.readFileSync(USERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading users file:", err);
    return [];
  }
};

// Helper to write users
const saveUsers = (users: UserRecord[]) => {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error("Error writing users file:", err);
  }
};

// Interfaces
interface Issue {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'reported' | 'verified' | 'in-progress' | 'resolved';
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  reporter: {
    name: string;
    avatar: string;
    xpEarned: number;
    userId?: string;
  };
  votes: number;
  votedUsers: string[];
  createdAt: string;
  updatedAt: string;
  imageUrl?: string;
  aiInsights?: {
    summary: string;
    suggestedSteps: string[];
    priorityScore: number; // 0-100
    estimatedCost: string;
    escalationPrediction: string;
  };
}

interface Hero {
  name: string;
  xp: number;
  badge: string;
  reportsCount: number;
  resolutionsCount: number;
}

// Initial seed issues (San Francisco geographic coordinates)
const SEED_ISSUES: Issue[] = [
  {
    id: "issue-1",
    title: "Crater-sized Pothole on 5th Street Crossing",
    description: "Huge pothole in the middle lane of 5th street crossing. Already caused two minor flat tires this morning. Deeply dangerous for cyclists in low visibility.",
    category: "Roads & Transit",
    status: "reported",
    severity: "high",
    location: {
      lat: 37.7772,
      lng: -122.4074,
      address: "500 Howard St, San Francisco, CA"
    },
    reporter: {
      name: "Marcus Aurelius",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Marcus",
      xpEarned: 120
    },
    votes: 14,
    votedUsers: ["user-1", "user-2"],
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    aiInsights: {
      summary: "High-traffic intersection hazard. High risk of vehicle damage or cyclist ejection. Immediate marking or temporary patching highly recommended.",
      suggestedSteps: [
        "Place visible warning cone or high-visibility spray circle around the pothole.",
        "File joint report to SF Municipal Transportation Agency (SFMTA).",
        "Coordinate a localized safety volunteer stand watch during evening rush hours."
      ],
      priorityScore: 84,
      estimatedCost: "$350 - $600 (municipal grade tarmac repair)",
      escalationPrediction: "Without intervention, active winter rains will expand this by 40% in 5 days, potentially shutting down the lane entirely."
    }
  },
  {
    id: "issue-2",
    title: "Gushing Water Pipeline Crack at Civic Center Plaza",
    description: "Water is continuously spewing out of a ground expansion joint near the grass lawns. Seems like an irrigation pipe leak. Thousands of gallons being wasted.",
    category: "Water Supply",
    status: "in-progress",
    severity: "medium",
    location: {
      lat: 37.7794,
      lng: -122.4178,
      address: "Civic Center, San Francisco, CA"
    },
    reporter: {
      name: "Sonia Gandhi",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Sonia",
      xpEarned: 350
    },
    votes: 28,
    votedUsers: ["user-1", "user-3", "user-4"],
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 2 days ago
    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    aiInsights: {
      summary: "Significant non-potable/irrigation line leakage. High volume waste. Moderate local soil erosion threat if unstopped.",
      suggestedSteps: [
        "Locate and close the nearest localized municipal water valve (usually near tree beds).",
        "Notify Civic Center facilities emergency helpline.",
        "Divert runoff water to nearby garden beds using sandbags to prevent plaza flooding."
      ],
      priorityScore: 68,
      estimatedCost: "$1,200 - $2,000 (pipe replacement & joint sealing)",
      escalationPrediction: "Soil saturating will cause a sinkhole in the adjacent walkway block within 48 hours."
    }
  },
  {
    id: "issue-3",
    title: "Dark Blind-spot: Damaged Streetlights along Dolores Park South",
    description: "Four consecutive streetlights are completely out on the southern sidewalk. Extremely dark at night. Group of local students had to use phone torches to walk home safely.",
    category: "Public Safety",
    status: "verified",
    severity: "critical",
    location: {
      lat: 37.7596,
      lng: -122.4269,
      address: "19th St & Dolores St, San Francisco, CA"
    },
    reporter: {
      name: "Linus Tech",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Linus",
      xpEarned: 80
    },
    votes: 42,
    votedUsers: ["user-2", "user-5", "user-6", "user-7"],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    aiInsights: {
      summary: "Critical pedestrian pathway darkness. High correlation with local security slipups and night hazards. Volunteers are organizing safety patrols.",
      suggestedSteps: [
        "Submit a streetlighting ticket on the city 311 portal with photo proof.",
        "Recommend temporary battery-powered sensor lights along the park railing.",
        "Initiate community evening walking buddies system until municipal repair completes."
      ],
      priorityScore: 92,
      estimatedCost: "$400 - $800 (ballast/LED replacement)",
      escalationPrediction: "Public safety risk index increases by 300% after 20:00. High probability of accidents or crime occurrences."
    }
  },
  {
    id: "issue-4",
    title: "Illegal Electronic Waste Pile behind Mission High School",
    description: "Large heap of electronic waste (CRT monitors, broken batteries, old computer chassis) dumped in the back alleyway. Acidic chemical smell.",
    category: "Waste Management",
    status: "resolved",
    severity: "high",
    location: {
      lat: 37.7600,
      lng: -122.4120,
      address: "3750 18th St, San Francisco, CA"
    },
    reporter: {
      name: "Diana Prince",
      avatar: "https://api.dicebear.com/7.x/pixel-art/svg?seed=Diana",
      xpEarned: 520
    },
    votes: 56,
    votedUsers: ["user-1", "user-2", "user-3"],
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    aiInsights: {
      summary: "Hazardous electronic waste dump. Heavy metal leaching danger (lead, mercury). Safe handling gear and specialized processing required.",
      suggestedSteps: [
        "Seal off the area with yellow boundary tape to keep school students away.",
        "Contact specialized toxic substance control branch of SF Waste Management.",
        "Coordinate cleanup drive utilizing protective masks and gloves."
      ],
      priorityScore: 78,
      estimatedCost: "$1,500 (hazardous material removal & recycling fees)",
      escalationPrediction: "Heavy metal toxicity leakage if rain occurs. Groundwater contamination risk."
    }
  }
];

// Helper to read issues
const loadIssues = (): Issue[] => {
  try {
    if (!fs.existsSync(ISSUES_FILE)) {
      fs.writeFileSync(ISSUES_FILE, JSON.stringify(SEED_ISSUES, null, 2));
      return SEED_ISSUES;
    }
    const data = fs.readFileSync(ISSUES_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading issues file:", err);
    return SEED_ISSUES;
  }
};

// Helper to write issues
const saveIssues = (issues: Issue[]) => {
  try {
    fs.writeFileSync(ISSUES_FILE, JSON.stringify(issues, null, 2));
  } catch (err) {
    console.error("Error writing issues file:", err);
  }
};

// --- AUTHENTICATION MIDDLEWARE & ENDPOINTS ---

// Authentication Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required." });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    req.user = decoded;
    next();
  });
};

// Optional Authentication Middleware
const optionalAuthenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (!err) {
      req.user = decoded;
    }
    next();
  });
};

// Register API
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const users = loadUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: "Email is already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser: UserRecord = {
      id: `user-${Date.now()}`,
      name,
      email,
      passwordHash,
      avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${name.replace(/\s+/g, '')}`,
      xp: 100, // Starter bonus XP
      badge: "Active Sentinel",
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    const token = jwt.sign({ id: newUser.id, name: newUser.name, email: newUser.email }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        avatar: newUser.avatar,
        xp: newUser.xp,
        badge: newUser.badge,
        reportsCount: 0,
        resolutionsCount: 0,
        createdAt: newUser.createdAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Registration failed: " + err.message });
  }
});

// Login API
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const users = loadUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

    const issues = loadIssues();
    const userIssues = issues.filter(i => i.reporter.userId === user.id);
    const reportsCount = userIssues.length;
    const resolutionsCount = userIssues.filter(i => i.status === "resolved").length;

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        xp: user.xp,
        badge: user.badge,
        reportsCount,
        resolutionsCount,
        createdAt: user.createdAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: "Login failed: " + err.message });
  }
});

// Get current logged-in user profile
app.get("/api/auth/me", authenticateToken, (req: any, res) => {
  const users = loadUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User profile not found." });
  }

  const issues = loadIssues();
  const userIssues = issues.filter(i => i.reporter.userId === user.id);
  const reportsCount = userIssues.length;
  const resolutionsCount = userIssues.filter(i => i.status === "resolved").length;

  let badge = "Novice Sentinel";
  if (user.xp > 600) {
    badge = "Legendary Guardian";
  } else if (user.xp > 350) {
    badge = "Elite City Ranger";
  } else if (user.xp > 200) {
    badge = "Vigilant Defender";
  } else if (user.xp > 50) {
    badge = "Active Sentinel";
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    xp: user.xp,
    badge,
    reportsCount,
    resolutionsCount,
    createdAt: user.createdAt
  });
});

// Get issues reported by the current logged-in user
app.get("/api/auth/profile/issues", authenticateToken, (req: any, res) => {
  const issues = loadIssues();
  const userIssues = issues.filter(i => i.reporter.userId === req.user.id);
  res.json(userIssues);
});

// --- API ENDPOINTS ---

// Get all issues
app.get("/api/issues", (req, res) => {
  const issues = loadIssues();
  res.json(issues);
});

// Report a new issue with AI categorization & insights
app.post("/api/issues/report", optionalAuthenticateToken, async (req: any, res) => {
  try {
    const { title, description, category, lat, lng, address, reporterName, imageUrl } = req.body;
    
    if (!title || !description || !lat || !lng) {
      return res.status(400).json({ error: "Missing required fields (title, description, lat, lng)." });
    }

    const issues = loadIssues();
    const newId = `issue-${Date.now()}`;

    let resolvedCategory = category || "Roads & Transit";
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    
    // Determine dynamic fallback severity & score based on category
    let fallbackScore = 50;
    if (resolvedCategory.includes("Safety") || resolvedCategory.includes("Power")) {
      severity = "high";
      fallbackScore = 75;
    } else if (resolvedCategory.includes("Water") || resolvedCategory.includes("Transit") || resolvedCategory.includes("Roads")) {
      severity = "medium";
      fallbackScore = 60;
    } else {
      severity = "low";
      fallbackScore = 35;
    }

    let aiInsights = {
      summary: `Hyperlocal incident identified: "${title}". Physical assessment suggests a ${severity}-priority hazard impacting localized district infrastructure safety.`,
      suggestedSteps: [
        "Demarcate the safety zone with high-visibility flags or temporary markers.",
        "Formally submit a municipal service dispatch request to SF District Public Works.",
        "Signal neighborhood monitors via the 3D twin network to verify active status."
      ],
      priorityScore: fallbackScore,
      estimatedCost: severity === "high" ? "$3,500 - $8,500 (Heavy Structural Patch)" : severity === "medium" ? "$850 - $1,800 (Service Crew Dispatch)" : "$150 - $350 (Light Treatment)",
      escalationPrediction: severity === "high" 
        ? "Failure to mitigate within 7 days may result in pedestrian/cyclist incidents or secondary structural leaks."
        : "Prolonged exposure to vehicular traffic will accelerate concrete wear, increasing remedial costs by up to 120%."
    };

    // AI Categorization and Analysis using Gemini 3.5 Flash
    if (process.env.GEMINI_API_KEY) {
      try {
        const prompt = `
          Analyze the following hyperlocal community issue report and provide structured insights.
          
          Report Title: "${title}"
          Report Description: "${description}"
          User Suggested Category: "${resolvedCategory}"
          
          Provide output strictly in JSON format matching the following schema structure:
          {
            "category": "Roads & Transit" | "Water Supply" | "Public Safety" | "Waste Management" | "Environment & Parks" | "Power & Grid",
            "severity": "low" | "medium" | "high" | "critical",
            "priorityScore": <number between 0 and 100>,
            "summary": "<1-2 sentence emergency assessment of the safety/infrastructure threat>",
            "suggestedSteps": [
              "<Immediate step 1 for local citizen safety>",
              "<Community organization step 2 to mitigate hazard>",
              "<Formal petition/action step 3 to involve local authorities>"
            ],
            "estimatedCost": "<Estimated bracket of municipal or community cost to patch/resolve>",
            "escalationPrediction": "<Scientific predictive risk of what happens if ignored for 7 days>"
          }
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                severity: { type: Type.STRING },
                priorityScore: { type: Type.INTEGER },
                summary: { type: Type.STRING },
                suggestedSteps: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                estimatedCost: { type: Type.STRING },
                escalationPrediction: { type: Type.STRING }
              },
              required: ["category", "severity", "priorityScore", "summary", "suggestedSteps", "estimatedCost", "escalationPrediction"]
            }
          }
        });

        if (response.text) {
          const aiResult = JSON.parse(response.text.trim());
          resolvedCategory = aiResult.category;
          severity = aiResult.severity;
          aiInsights = {
            summary: aiResult.summary,
            suggestedSteps: aiResult.suggestedSteps,
            priorityScore: aiResult.priorityScore,
            estimatedCost: aiResult.estimatedCost,
            escalationPrediction: aiResult.escalationPrediction
          };
        }
      } catch (aiErr) {
        console.error("Gemini classification failed, reverting to baseline analysis:", aiErr);
      }
    }

    let finalReporterName = reporterName || "Anonymous Hero";
    let finalReporterAvatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${finalReporterName.replace(/\s+/g, '') || 'Hero' + Math.floor(Math.random() * 1000)}`;
    let finalReporterUserId = undefined;
    let xpEarned = 20;

    if (req.user) {
      const users = loadUsers();
      const user = users.find(u => u.id === req.user.id);
      if (user) {
        finalReporterName = user.name;
        finalReporterAvatar = user.avatar;
        finalReporterUserId = user.id;
        xpEarned = 50;

        user.xp += 50;
        if (user.xp > 600) {
          user.badge = "Legendary Guardian";
        } else if (user.xp > 350) {
          user.badge = "Elite City Ranger";
        } else if (user.xp > 200) {
          user.badge = "Vigilant Defender";
        } else {
          user.badge = "Active Sentinel";
        }
        saveUsers(users);
      }
    }

    const newIssue: Issue = {
      id: newId,
      title,
      description,
      category: resolvedCategory,
      status: "reported",
      severity,
      location: {
        lat,
        lng,
        address: address || "Located in City Center Area"
      },
      reporter: {
        name: finalReporterName,
        avatar: finalReporterAvatar,
        xpEarned,
        userId: finalReporterUserId
      },
      votes: 1,
      votedUsers: [finalReporterUserId || "user-1"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      imageUrl: imageUrl || undefined,
      aiInsights
    };

    issues.unshift(newIssue);
    saveIssues(issues);

    res.status(201).json(newIssue);
  } catch (err: any) {
    console.error("Error creating issue:", err);
    res.status(500).json({ error: "Failed to create issue. " + err.message });
  }
});

// Verify / Vote on an issue (Increases community validation)
app.post("/api/issues/:id/verify", (req, res) => {
  const { userId } = req.body;
  const issues = loadIssues();
  const index = issues.findIndex(i => i.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Issue not found." });
  }

  const issue = issues[index];
  const uId = userId || "anonymous-citizen";

  if (issue.votedUsers.includes(uId)) {
    return res.status(400).json({ error: "You have already verified this report." });
  }

  issue.votes += 1;
  issue.votedUsers.push(uId);
  
  // Transition status based on community interest
  if (issue.status === "reported" && issue.votes >= 5) {
    issue.status = "verified";
  }

  issue.updatedAt = new Date().toISOString();
  issues[index] = issue;
  saveIssues(issues);

  // Award XP to the reporter if they are a registered user
  if (issue.reporter.userId) {
    const users = loadUsers();
    const reporterUser = users.find(u => u.id === issue.reporter.userId);
    if (reporterUser) {
      reporterUser.xp += 10;
      if (reporterUser.xp > 600) {
        reporterUser.badge = "Legendary Guardian";
      } else if (reporterUser.xp > 350) {
        reporterUser.badge = "Elite City Ranger";
      } else if (reporterUser.xp > 200) {
        reporterUser.badge = "Vigilant Defender";
      } else {
        reporterUser.badge = "Active Sentinel";
      }
      saveUsers(users);
    }
  }

  res.json(issue);
});

// Resolve an issue
app.post("/api/issues/:id/resolve", (req, res) => {
  const issues = loadIssues();
  const index = issues.findIndex(i => i.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Issue not found." });
  }

  const issue = issues[index];
  issue.status = "resolved";
  issue.updatedAt = new Date().toISOString();
  
  issues[index] = issue;
  saveIssues(issues);

  // Award XP to the reporter if they are a registered user
  if (issue.reporter.userId) {
    const users = loadUsers();
    const reporterUser = users.find(u => u.id === issue.reporter.userId);
    if (reporterUser) {
      reporterUser.xp += 150;
      if (reporterUser.xp > 600) {
        reporterUser.badge = "Legendary Guardian";
      } else if (reporterUser.xp > 350) {
        reporterUser.badge = "Elite City Ranger";
      } else if (reporterUser.xp > 200) {
        reporterUser.badge = "Vigilant Defender";
      } else {
        reporterUser.badge = "Active Sentinel";
      }
      saveUsers(users);
    }
  }

  res.json(issue);
});

// Community Statistics & Hotspot analytics
app.get("/api/community/stats", async (req, res) => {
  try {
    const issues = loadIssues();
    
    // Total issues count by status
    const reported = issues.filter(i => i.status === "reported").length;
    const verified = issues.filter(i => i.status === "verified").length;
    const inProgress = issues.filter(i => i.status === "in-progress").length;
    const resolved = issues.filter(i => i.status === "resolved").length;
    const total = issues.length;

    // Gamified Citizen Leaderboard
    const heroesMap = new Map<string, Hero>();
    
    // Process reporters
    issues.forEach(issue => {
      const name = issue.reporter.name;
      if (!heroesMap.has(name)) {
        heroesMap.set(name, {
          name,
          xp: 100, // base starter
          badge: "Novice Sentinel",
          reportsCount: 0,
          resolutionsCount: 0
        });
      }
      
      const hero = heroesMap.get(name)!;
      hero.reportsCount += 1;
      hero.xp += 50; // XP per report
      if (issue.status === 'resolved') {
        hero.resolutionsCount += 1;
        hero.xp += 150; // Extra resolution bonus
      }

      // Assign badges
      if (hero.xp > 600) {
        hero.badge = "Legendary Guardian";
      } else if (hero.xp > 350) {
        hero.badge = "Elite City Ranger";
      } else if (hero.xp > 200) {
        hero.badge = "Vigilant Defender";
      } else {
        hero.badge = "Active Sentinel";
      }
    });

    const leaderboard = Array.from(heroesMap.values())
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 5);

    // AI Predictive Trends
    let aiTrendText = "Aggregated data indicates localized stability across roads, public gridlines, and water infrastructure. Community resolution activities are highly active.";
    
    if (process.env.GEMINI_API_KEY && issues.length > 0) {
      try {
        const issuesSummary = issues.map(i => `- ${i.title} (${i.category}, Status: ${i.status}, Votes: ${i.votes})`).join("\n");
        const prompt = `
          Analyze the following community reports summary to generate a single high-level "Hyperlocal Trend & Hazard Alert".
          Write in a smart, futuristic city-planner voice. Outline any geographical trends or cluster warnings (e.g. if we have leaks or pothole groupings) and predict municipal concerns. Limit your response to 3 sentences maximum. No markdown formatting.
          
          Active Issues:\n${issuesSummary}
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt
        });
        if (response.text) {
          aiTrendText = response.text.trim();
        }
      } catch (trendErr) {
        console.error("AI predictive trends failed:", trendErr);
      }
    }

    res.json({
      summary: {
        total,
        reported,
        verified,
        inProgress,
        resolved,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 100
      },
      leaderboard,
      predictiveTrend: aiTrendText
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to compile stats: " + err.message });
  }
});

// Helper for rich interactive offline fallback planning responses
function getCivicAIFallback(message: string, issue: any): string {
  const lowercaseMsg = message.toLowerCase();
  
  let contextStr = issue 
    ? `regarding the report: **"${issue.title}"** located at **${issue.location.address}** (${issue.category})`
    : "regarding community planning initiatives";
    
  if (lowercaseMsg.includes("petition") || lowercaseMsg.includes("official email") || lowercaseMsg.includes("email to the municipal")) {
    const title = issue ? issue.title : "Hyperlocal Community Infrastructure Issue";
    const address = issue ? issue.location.address : "[Insert Issue Location/Address]";
    const category = issue ? issue.category : "Public Works & Infrastructure";
    const description = issue ? issue.description : "[Describe the issue in detail]";
    
    return `### 📋 OFFICIAL PETITION & REPRESENTATIVE BRIEF
I have drafted an official, legally brief petition letter to your district municipal council representative and public works managers ${contextStr}.

---

**SUBJECT:** Urgent Request for Intervention: ${title} — [Your District / Zip Code]

**DATE:** ${new Date().toLocaleDateString()}
**TO:** District Supervisor and Director of Municipal Public Works
**FROM:** Residents of the Hyperlocal Community Sentinel Network

**Dear Director and Honorable Council Representatives,**

We are writing to you collectively to bring to your immediate attention a critical community safety and infrastructure hazard that requires urgent intervention.

**1. HAZARD SPECIFICATION:**
*   **Identified Issue:** ${title}
*   **Location Point:** ${address}
*   **Infrastructure Domain:** ${category}
*   **Citizen Threat Level:** High Priority (Under continuous citizen-led safety verification)

**2. DESCRIPTION OF FIELD IMPACTS:**
${description}

**3. PROPOSED ACTIONS REQUESTED:**
*   **Immediate Field Assessment:** We request that a municipal engineering or field maintenance crew be dispatched to verify this hazard within 48 hours.
*   **Remediation Plan:** Please provide a timeline for the permanent repair or mitigation of this hazard to ensure pedestrian and vehicular safety.
*   **Community Partnership:** Local residents have volunteered to monitor the site and coordinate basic safety warnings until formal operations commence.

We thank you in advance for your rapid attention to this municipal request. We look forward to your response and field action.

Sincerely,
**[Your Name / Signature]**  
*Coordinated via Community Hero Network*

---

### ### Next Steps for Citizens:
1. **Gather Signatures**: Share this draft in your local neighborhood group and collect at least 10 supporting signatures.
2. **Submit to Representative**: Copy the text above, insert your specific details, and email it to your district council representative's public address.
3. **Log Progress**: Update the status on our 3D Digital Twin Map once the public crew arrives!`;
  }
  
  if (lowercaseMsg.includes("cleanup") || lowercaseMsg.includes("checklist") || lowercaseMsg.includes("repair")) {
    const title = issue ? issue.title : "Hyperlocal Civic Cleanup";
    const category = issue ? issue.category : "Community Safety";
    return `### 🧹 COMMUNITY REPAIR & CLEANUP TASKFORCE
I have generated a comprehensive safety-first checklist and organization blueprint for coordinating a citizen action taskforce ${contextStr}.

### ### Phase 1: Preparation & Coordination (3-5 Days Out)
1. **Define the Scope**: Ensure the cleanup targets non-hazardous, safe materials (debris removal, basic paint patching, light sweeping). Do not attempt major gas, high-voltage, or structural repairs without professional crews.
2. **Recruit Volunteers**: Engage 4-8 local neighbors using the **Community Hero Network** chat.
3. **Procure Equipment**:
   *   High-visibility safety vests (mandatory)
   *   Heavy-duty work gloves and garbage grabbers
   *   Makeshift hazard signage and yellow caution tape
   *   First-aid kit and hydration station

### ### Phase 2: Active Safety Demarcation (On-Site)
1. **Establish the Safe Zone**: Set up caution tape 15 feet around the affected area before commencing work.
2. **Post Warn Signs**: If working near roads, place temporary warning signs at least 50 feet ahead to alert oncoming traffic.
3. **Assign Roles**:
   *   **Safety Officer**: 1 person dedicated to observing traffic and volunteer safety.
   *   **Active Crew**: 2-4 people handling debris clearing/cleanup.
   *   **Communications Coordinator**: 1 person logging active photo updates for the 3D twin grid.

### ### Phase 3: Reporting & Closure
1. **Proper Disposal**: Bag all collected trash and place it in authorized neighborhood collection bins.
2. **Post-Action Documentation**: Take photos of the resolved hazard area.
3. **Mark Resolved**: Use the Community Hero app to file a **Verification Check** or **Resolve Request** to update our digital twin!`;
  }
  
  if (lowercaseMsg.includes("safety") || lowercaseMsg.includes("precaution") || lowercaseMsg.includes("hazard")) {
    const title = issue ? issue.title : "Hyperlocal Hazard Node";
    return `### ⚠️ CIVILIAN SAFETY & HAZARD MITIGATION
I have generated an immediate tactical safety protocol ${contextStr} to protect neighborhood residents and passersby prior to official municipal repair.

### ### 1. Immediate Physical Demarcation
*   **Pedestrian Diversion**: If the hazard block is on a sidewalk (e.g., broken concrete, low-hanging wire, open valve), place bright physical markers or heavy traffic cones to redirect pedestrians to a safe path.
*   **Nighttime Visibility**: Secure a battery-powered flashing beacon or solar light to the hazard area. This is critical for preventing trips and accidents during dark hours.

### ### 2. Safe Observation & Telemetry Logging
*   **Do Not Touch Unknown Objects**: If there is suspected power lines, chemical leaks, or unstable structural debris, maintain a minimum 30-foot perimeter.
*   **Photographic Log**: Take high-contrast photos during day and night hours to document any rapid escalation (e.g., crack spreading, water volume increasing) and post them to the **Report Studio** thread.

### ### 3. Emergency Contacts Priority List
1.  **Life-Threatening Emergency**: Dial **911** immediately.
2.  **SF Municipal Services Line**: Dial **311** to log the official city maintenance ticket number.
3.  **Local Utility Grid (PG&E)**: For gas/electrical hazards, call **1-800-743-5000**.

### ### 4. Hyperlocal Crowdsourced Patrol
*   Form a daily 2-minute safety patrol with 2 neighbors to check if temporary barricades are intact and alert municipal crews of any changes.`;
  }

  // General fallback text
  const title = issue ? issue.title : "Community Safety Initiatives";
  return `### 💡 CIVIC_AI ASSISTANT OPERATIONS
I am ready to help you plan, coordinate, and resolve hyperlocal community issues ${contextStr}!

How would you like to proceed? Click one of the quick templates above or type your request below:
*   **"Draft a Petition"**: Generates a professional letter to municipal representatives.
*   **"Organize Cleanup"**: Creates a community taskforce plan with role allocations.
*   **"Safety Precautions"**: Builds a tactical safety protocol to secure the area.

*(Note: Connect your paid Gemini API Key in Settings > Secrets to unlock full conversational reasoning, dynamic local code parsing, and interactive letters.)*`;
}

// Interactive AI Planner & Community Assistant Chatbot
app.post("/api/ai/planner", async (req, res) => {
  try {
    const { message, issueContextId } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message content required." });
    }

    const issues = loadIssues();
    let issueContextDetails = "";
    const activeIssue = issueContextId ? issues.find(i => i.id === issueContextId) : null;

    if (activeIssue) {
      issueContextDetails = `
        Active contextual issue being discussed:
        Title: "${activeIssue.title}"
        Category: "${activeIssue.category}"
        Status: "${activeIssue.status}"
        Location: "${activeIssue.location.address}" (Lat: ${activeIssue.location.lat}, Lng: ${activeIssue.location.lng})
        Description: "${activeIssue.description}"
      `;
    }

    let reply = "I am ready to assist you in planning your local community initiatives!";

    if (process.env.GEMINI_API_KEY) {
      try {
        const systemPrompt = `
          You are "CivicAI" - a hyper-intelligent 3D Digital Twin City Assistant & Civic Counselor.
          You help citizens organize neighborhood cleanups, write polite and legally sound petitions to municipal bodies, structure community budgets, and safely coordinate repairs for hyperlocal problems.
          
          Keep your tone empowering, collaborative, and professional, yet tech-forward.
          Use precise, structured formatting. When requested, write out fully detailed drafts of official emails or local council petition text!
          ${issueContextDetails}
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: message,
          config: {
            systemInstruction: systemPrompt
          }
        });

        if (response.text) {
          reply = response.text.trim();
        } else {
          throw new Error("Empty response text received from Gemini.");
        }
      } catch (geminiErr: any) {
        console.error("Gemini API call failed inside AI Planner, using rich offline fallback:", geminiErr);
        reply = getCivicAIFallback(message, activeIssue);
      }
    } else {
      reply = getCivicAIFallback(message, activeIssue);
    }

    res.json({ reply });
  } catch (err: any) {
    console.error("AI Planner error:", err);
    res.status(500).json({ error: "Failed to generate AI plan." });
  }
});

// Serve frontend build and handle dev middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server mounted.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Serving compiled static assets in production.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server listening on http://localhost:${PORT}`);
  });
}

startServer();
