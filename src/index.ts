import { request, ProxyAgent } from 'undici';

interface ProxyConfig {
  ip: string;
  port: number;
  username: string;
  password: string;
}

interface LatencyResult {
  timestamp: Date;
  proxy: string;
  latency: number;
  success: boolean;
  error?: string;
  responseData?: any;
}

class HttpLatencyTester {
  private readonly targetUrl: string;
  private readonly proxies: ProxyConfig[];
  private currentProxyIndex = 0;

  constructor(targetUrl: string, proxies: ProxyConfig[] = []) {
    this.targetUrl = targetUrl;
    this.proxies = proxies;
  }

  async testDirect(): Promise<LatencyResult> {
    const start = process.hrtime.bigint();
    const timestamp = new Date();
    
    try {
      const response = await request(this.targetUrl, {
        headers: {
          'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
        }
      });
      
      const end = process.hrtime.bigint();
      const latency = Number(end - start) / 1_000_000; // Convert to milliseconds
      
      const responseData = await response.body.json();
      
      return {
        timestamp,
        proxy: 'direct',
        latency,
        success: true,
        responseData
      };
    } catch (error) {
      const end = process.hrtime.bigint();
      const latency = Number(end - start) / 1_000_000;
      
      return {
        timestamp,
        proxy: 'direct',
        latency,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async testWithProxy(proxyConfig: ProxyConfig): Promise<LatencyResult> {
    const start = process.hrtime.bigint();
    const timestamp = new Date();
    const proxyString = `${proxyConfig.ip}:${proxyConfig.port}`;
    
    try {
      const proxyAgent = new ProxyAgent({
        uri: `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.ip}:${proxyConfig.port}`,
        requestTls: {
          rejectUnauthorized: false
        }
      });

      const response = await request(this.targetUrl, {
        headers: {
          'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
        },
        dispatcher: proxyAgent
      });
      
      const end = process.hrtime.bigint();
      const latency = Number(end - start) / 1_000_000;
      
      const responseData = await response.body.json();
      
      return {
        timestamp,
        proxy: proxyString,
        latency,
        success: true,
        responseData
      };
    } catch (error) {
      const end = process.hrtime.bigint();
      const latency = Number(end - start) / 1_000_000;
      
      return {
        timestamp,
        proxy: proxyString,
        latency,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async runContinuousTesting(intervalMs: number = 1000, useProxy: boolean = true, count: number = 10): Promise<void> {
    console.log(`Starting continuous testing every ${intervalMs}ms...`);
    console.log(`Target URL: ${this.targetUrl}`);
    console.log(`Mode: ${useProxy && this.proxies.length > 0 ? 'Proxy rotation' : 'Direct connection'}`);
    console.log(`Tests to run: ${count}`);
    console.log('---');

    let testsCompleted = 0;

    const interval = setInterval(async () => {
      try {
        let result: LatencyResult;
        
        if (useProxy && this.proxies.length > 0) {
          const proxy = this.proxies[this.currentProxyIndex];
          result = await this.testWithProxy(proxy!);
          this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
        } else {
          result = await this.testDirect();
        }

        this.logResult(result);
        testsCompleted++;

        if (testsCompleted >= count) {
          console.log(`\nCompleted ${testsCompleted} tests. Shutting down...`);
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Scheduling error:', error);
        testsCompleted++;
        
        if (testsCompleted >= count) {
          console.log(`\nCompleted ${testsCompleted} tests (with errors). Shutting down...`);
          clearInterval(interval);
        }
      }
    }, intervalMs);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(`\nForced shutdown after ${testsCompleted} tests...`);
      clearInterval(interval);
      process.exit(0);
    });
  }

  async singleTest(useProxy: boolean = false, proxyIndex?: number): Promise<LatencyResult> {
    if (useProxy && this.proxies.length > 0) {
      const index = proxyIndex !== undefined ? proxyIndex % this.proxies.length : this.currentProxyIndex;
      const proxy = this.proxies[index];
      return await this.testWithProxy(proxy!);
    } else {
      return await this.testDirect();
    }
  }

  private logResult(result: LatencyResult): void {
    const status = result.success ? '✓' : '✗';
    const latencyFormatted = result.latency.toFixed(2);
    
    console.log(`[${result.timestamp.toISOString()}] ${status} ${result.proxy} - ${latencyFormatted}ms`);
    
    if (result.success && result.responseData) {
      const data = result.responseData.data;
      if (data) {
        const listedAt = data.first_listed_at || 'N/A';
        const category = data.category || 'N/A';
        const title = data.title || 'N/A';
        console.log(`  Data: ${listedAt} | ${category} | ${title}`);
      }
    }
    
    if (!result.success) {
      console.log(`  Error: ${result.error}`);
    }
  }
}

// Example usage
async function main(): Promise<void> {
  const targetUrl = 'https://api-manager.upbit.com/api/v1/announcements/5285';
  
  // Define proxies (similar to your Java code)
  const proxies: ProxyConfig[] = [
    {
      ip: '38.154.227.167',
      port: 5868,
      username: 'ajjdymmk',
      password: 'din6lshestcq'
    }
    // Add more proxies as needed
  ];

  const tester = new HttpLatencyTester(targetUrl, proxies);
  
  // Example 1: Test with direct connection only
  // console.log('=== Testing Direct Connection ===');
  // await tester.runContinuousTesting(1000, false); // useProxy = false
  
  // Example 2: Test with proxy rotation (uncomment to use)
  console.log('=== Testing with Proxy Rotation ===');
  await tester.runContinuousTesting(1000, true); // useProxy = true
  
  // Example 3: Single tests
  // const directResult = await tester.singleTest(false);
  // console.log('Direct test result:', directResult);
  
  // const proxyResult = await tester.singleTest(true, 0);
  // console.log('Proxy test result:', proxyResult);
}

// Run the application
if (require.main === module) {
  main().catch(console.error);
}