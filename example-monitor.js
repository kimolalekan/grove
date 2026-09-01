#!/usr/bin/env node
const GROVE_URL = "http://localhost:3000";
const API_KEY = process.argv[2] || process.env.GROVE_API_KEY;

const ENDPOINTS = [
  "https://jsonplaceholder.typicode.com/posts/1",
  "https://httpbin.org/delay/2",
  "https://httpstat.us/500",
];

if (!API_KEY) {
  console.error("❌ API key required");
  console.error("Usage: node example-monitor.js YOUR_API_KEY");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function setupAlertRules() {
  console.log("⚙️ Setting up alert rules...\n");

  const rules = [
    {
      name: "Slow Response Alert",
      condition: "greater than",
      threshold: "1500",
      metric: "response_time",
      notify: "dev@company.com",
      channel: "email",
      enabled: true,
    },
    {
      name: "High Error Rate Alert",
      condition: "greater than",
      threshold: "10",
      metric: "error_rate",
      notify: "ops@company.com",
      channel: "email",
      enabled: true,
    },
  ];

  for (const rule of rules) {
    try {
      const response = await fetch(`${GROVE_URL}/api/alert-rules`, {
        method: "POST",
        headers,
        body: JSON.stringify(rule),
      });

      if (response.ok) {
        console.log(`✅ Created: ${rule.name}`);
      } else {
        console.log(`ℹ️  Rule exists: ${rule.name}`);
      }
    } catch {
      console.log(`ℹ️  Rule exists: ${rule.name}`);
    }
  }
  console.log("");
}

async function monitorEndpoint(url) {
  const startTime = Date.now();

  try {
    console.log(`🔍 Testing ${url}`);
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    const responseTime = Date.now() - startTime;

    console.log(`✅ Status: ${response.status}, Time: ${responseTime}ms`);

    if (responseTime > 1500) {
      await triggerResponseTimeAlert(responseTime, url);
    }

    return { success: true, responseTime, status: response.status };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const status = 0;

    console.log(
      `❌ Status: ${status}, Time: ${responseTime}ms, Error: ${error.message}`,
    );

    await triggerErrorRateAlert(url);

    return { success: false, responseTime, status };
  }
}

async function triggerResponseTimeAlert(responseTime, source) {
  try {
    const response = await fetch(
      `${GROVE_URL}/api/alerts/trigger/response-time`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          responseTime,
          source: `Monitor: ${source}`,
        }),
      },
    );

    const data = await response.json();

    if (data.success && data.data.alertsTriggered > 0) {
      console.log(`🚨 SLOW RESPONSE ALERT: ${responseTime}ms`);
      console.log(`   📧 Emails sent: ${data.data.emailsSent}`);
    }
  } catch (error) {
    console.error(`❌ Alert failed:`, error.message);
  }
}

async function triggerErrorRateAlert(source) {
  try {
    const response = await fetch(`${GROVE_URL}/api/alerts/trigger/error-rate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        errorRate: 100, // 100% error rate for this endpoint
        source: `Monitor: ${source}`,
      }),
    });

    const data = await response.json();

    if (data.success && data.data.alertsTriggered > 0) {
      console.log(`🚨 ERROR RATE ALERT: 100%`);
      console.log(`   📧 Emails sent: ${data.data.emailsSent}`);
    }
  } catch (error) {
    console.error(`❌ Alert failed:`, error.message);
  }
}

async function main() {
  console.log("🔍 Simple API Monitor with Grove Alerts\n");

  try {
    await fetch(`${GROVE_URL}/api/health`, { headers });
    console.log("✅ Grove server connected\n");

    await setupAlertRules();

    console.log("⏳ Waiting for rules to be indexed...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log("🚀 Starting monitoring...\n");

    const results = [];
    for (const url of ENDPOINTS) {
      const result = await monitorEndpoint(url);
      results.push(result);
      console.log("");

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const totalRequests = results.length;
    const errors = results.filter((r) => !r.success).length;
    const avgTime = Math.round(
      results.reduce((sum, r) => sum + r.responseTime, 0) / totalRequests,
    );

    console.log("📊 MONITORING COMPLETE");
    console.log("==============================");
    console.log(`Total checks: ${totalRequests}`);
    console.log(`Errors: ${errors}`);
    console.log(`Error rate: ${Math.round((errors / totalRequests) * 100)}%`);
    console.log(`Average response time: ${avgTime}ms`);
    console.log(
      "\n💡 Check Grove dashboard for alerts: http://localhost:3000/alerts",
    );
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      console.error("❌ Grove server not running at", GROVE_URL);
      console.error("💡 Start server: npm run dev");
    } else {
      console.error("❌ Error:", error.message);
    }
    process.exit(1);
  }
}

main();
