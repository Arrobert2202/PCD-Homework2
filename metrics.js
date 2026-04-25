const fs = require('fs');
const { execSync } = require('child_process');

const FAST_LAZY_BEE_URL = "https://fast-lazy-bee-917169469975.us-central1.run.app/api/v1/movies";
const GATEWAY_URL       = "https://gateway-service-sy7mwe34bq-uc.a.run.app/api/analytics/top-movies";
const TEST_MOVIE_ID     = "573a139cf29313caabcf560f";
const PUBSUB_TOPIC      = "movie-events";
const OUTPUT_FILE       = 'final_metrics_report.txt';

function log(message) {
    console.log(message);
    fs.appendFileSync(OUTPUT_FILE, message + '\n');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
    if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);

    log("=== PCD PROJECT 1 — METRICS REPORT ===");
    log(`Date: ${new Date().toISOString()}`);
    log(`Service A: ${FAST_LAZY_BEE_URL}`);
    log(`Gateway:   ${GATEWAY_URL}\n`);

    log("--- METRIC 1: End-to-End Latency ---");

    let baselineCount = 0;
    try {
        const baselineRes = await fetch(GATEWAY_URL);
        const baselineData = await baselineRes.json();
        const existing = baselineData.find(item => item.id === TEST_MOVIE_ID || item.movieId === TEST_MOVIE_ID);
        baselineCount = existing ? existing.viewCount : 0;
        log(`   Baseline viewCount for test movie: ${baselineCount}`);
    } catch (e) {
        log(`   Could not fetch baseline: ${e.message}`);
    }

    const e2eStart = performance.now();
    try {
        const serviceARes = await fetch(`${FAST_LAZY_BEE_URL}/${TEST_MOVIE_ID}`);
        const serviceALatency = (performance.now() - e2eStart).toFixed(2);
        log(`   Service A responded in: ${serviceALatency} ms (HTTP ${serviceARes.status})`);
    } catch (e) {
        log(`   ERROR reaching Service A: ${e.message}\n`);
    }

    log(`   Polling Gateway for viewCount to reach ${baselineCount + 1}...`);
    let e2eFound = false;
    for (let i = 1; i <= 20; i++) {
        await sleep(1000);
        try {
            const res = await fetch(GATEWAY_URL);
            const data = await res.json();
            const item = data.find(d => d.id === TEST_MOVIE_ID || d.movieId === TEST_MOVIE_ID);
            if (item && item.viewCount > baselineCount) {
                const e2eLatency = ((performance.now() - e2eStart) / 1000).toFixed(2);
                log(`   SUCCESS — viewCount updated to ${item.viewCount} after ${e2eLatency}s`);
                log(`   End-to-end latency (access → dashboard update): ${e2eLatency} seconds\n`);
                e2eFound = true;
                break;
            }
            console.log(`      ...T+${i}s: viewCount still ${item ? item.viewCount : 'not found'}`);
        } catch (err) {
            console.log(`      ...T+${i}s: ${err.message}`);
        }
    }
    if (!e2eFound) {
        log(`   TIMEOUT — pipeline did not complete within 20 seconds.\n`);
    }

    log("--- METRIC 2: Eventual Consistency Window (Lab 6 §4.4 method) ---");

    const runs = 5;
    const consistencyResults = [];

    for (let run = 1; run <= runs; run++) {
        const uniqueId = `consistency_run${run}_${Date.now()}`;
        const payload = JSON.stringify({ movieId: uniqueId, movieTitle: `Consistency Test ${run}`, event: "movie_viewed" });

        try {
            execSync(`gcloud pubsub topics publish ${PUBSUB_TOPIC} --message='${payload}'`, { stdio: 'pipe' });
        } catch (e) {
            log(`   ERROR publishing run ${run}: ${e.message}`);
            continue;
        }

        const start = performance.now();
        let found = false;
        for (let i = 1; i <= 20; i++) {
            await sleep(1000);
            try {
                const res = await fetch(GATEWAY_URL);
                const data = await res.json();
                if (data.some(item => item.id === uniqueId || item.movieId === uniqueId)) {
                    const window = ((performance.now() - start) / 1000).toFixed(2);
                    log(`   Run ${run}: consistent after ${window}s`);
                    consistencyResults.push(parseFloat(window));
                    found = true;
                    break;
                }
            } catch (_) {}
        }
        if (!found) log(`   Run ${run}: TIMEOUT (>20s)`);
    }

    if (consistencyResults.length > 0) {
        const avg = (consistencyResults.reduce((a, b) => a + b, 0) / consistencyResults.length).toFixed(2);
        const min = Math.min(...consistencyResults).toFixed(2);
        const max = Math.max(...consistencyResults).toFixed(2);
        log(`   Results over ${consistencyResults.length} runs:`);
        log(`     Min: ${min}s  |  Max: ${max}s  |  Avg: ${avg}s`);
        log(`   Consistency window (avg): ${avg} seconds\n`);
    } else {
        log(`   No successful runs.\n`);
    }

    log("--- METRIC 3: Cloud Function Throughput (via Service A load test) ---");

    let autocannon;
    try {
        autocannon = require('autocannon');
    } catch (e) {
        log(`   autocannon not found — run: npm install autocannon\n`);
        autocannon = null;
    }

    if (autocannon) {
        const loads = [
            { connections: 10,  label: 'Low' },
            { connections: 50,  label: 'Medium' },
            { connections: 100, label: 'High' },
        ];

        for (const { connections, label } of loads) {
            log(`\n   ${label} load (${connections} concurrent connections, 15s)...`);
            await new Promise((resolve) => {
                const instance = autocannon({
                    url: `${FAST_LAZY_BEE_URL}/${TEST_MOVIE_ID}`,
                    connections,
                    duration: 15,
                }, (err, result) => {
                    if (err) {
                        log(`   ERROR: ${err.message}`);
                    } else {
                        log(`   Requests/sec:  ${result.requests.average.toFixed(1)}`);
                        log(`   Latency avg:   ${result.latency.average.toFixed(1)} ms`);
                        log(`   Latency p99:   ${result.latency.p99} ms`);
                        log(`   Errors:        ${result.errors} (${((result.errors / result.requests.total) * 100).toFixed(1)}%)`);
                        log(`   Total requests: ${result.requests.total}`);
                    }
                    resolve();
                });
                autocannon.track(instance, { renderProgressBar: false });
            });
            await sleep(5000);
        }
        log('');
    }

    log("--- METRIC 4: WebSocket Reconnection Behavior ---");
    log(`   Frontend reconnection config:`);
    log(`     Initial retry delay: 500ms | Backoff: x2 | Max delay: 10s`);
    log(`\n   Automated connection test:`);

    let ws;
    try {
        ws = require('ws');
    } catch (e) {
        log(`   ws not found — run: npm install ws`);
        ws = null;
    }

    if (ws) {
        const WS_URL = GATEWAY_URL.replace('https://', 'wss://').replace('/api/analytics/top-movies', '');
        await new Promise((resolve) => {
            const client = new ws(WS_URL);
            const connectStart = performance.now();

            client.on('open', () => {
                const connectTime = (performance.now() - connectStart).toFixed(0);
                log(`   WebSocket connected to gateway in ${connectTime}ms`);
                log(`   Connection verified: OK`);
                client.close();
                resolve();
            });

            client.on('error', (err) => {
                log(`   WebSocket connection failed: ${err.message}`);
                resolve();
            });

            setTimeout(() => {
                log(`   WebSocket connection timed out after 10s`);
                client.terminate();
                resolve();
            }, 10000);
        });
    }

    log(`\n   To demonstrate reconnection during the demo:`);
    log(`   1. Open the dashboard (status = "Live")`);
    log(`   2. Run: curl -X POST https://gateway-service-sy7mwe34bq-uc.a.run.app/admin/kill-connections`);
    log(`   3. Dashboard shows "Disconnected — reconnecting in 500ms..."`);
    log(`   4. Client reconnects automatically, status returns to "Live"\n`);

    log("=== TESTING COMPLETE ===");
    console.log(`\nResults saved to: ${OUTPUT_FILE}`);
}

runTests();
