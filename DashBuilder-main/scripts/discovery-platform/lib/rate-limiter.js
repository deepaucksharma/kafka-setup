const { EventEmitter } = require('events');
const pLimit = require('p-limit');

class RateLimiter extends EventEmitter {
  constructor({ queriesPerMinute = 2500, maxConcurrent = 10 }) {
    super();
    
    this.queriesPerMinute = queriesPerMinute;
    this.maxConcurrent = maxConcurrent;
    
    // Concurrent limiter
    this.concurrentLimiter = pLimit(maxConcurrent);
    
    // Rate limiting state
    this.queryCount = 0;
    this.windowStart = Date.now();
    this.queue = [];
    this.processing = false;
    
    // Token bucket for smooth rate limiting
    this.tokens = queriesPerMinute;
    this.lastRefill = Date.now();
    this.refillRate = queriesPerMinute / 60000; // tokens per ms
    
    // Start the queue processor
    this.startQueueProcessor();
  }
  
  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }
  
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      // Refill tokens
      this.refillTokens();
      
      // Check if we have tokens available
      if (this.tokens < 1) {
        // Calculate wait time
        const tokensNeeded = 1 - this.tokens;
        const waitTime = Math.ceil(tokensNeeded / this.refillRate);
        
        this.emit('rateLimitReached', { waitTime });
        
        // Wait for tokens to refill
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.refillTokens();
      }
      
      // Check minute window
      const elapsed = Date.now() - this.windowStart;
      if (elapsed >= 60000) {
        // Reset window
        this.queryCount = 0;
        this.windowStart = Date.now();
      }
      
      // Check if we're at the limit for this minute
      if (this.queryCount >= this.queriesPerMinute) {
        const waitTime = 60000 - elapsed;
        this.emit('rateLimitReached', { waitTime });
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Reset window
        this.queryCount = 0;
        this.windowStart = Date.now();
      }
      
      // Process next item
      const { fn, resolve, reject } = this.queue.shift();
      
      try {
        // Use concurrent limiter
        const result = await this.concurrentLimiter(async () => {
          // Consume a token
          this.tokens -= 1;
          this.queryCount++;
          
          // Execute the function
          return await fn();
        });
        
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    
    this.processing = false;
  }
  
  refillTokens() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.queriesPerMinute, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  startQueueProcessor() {
    // Process queue periodically
    setInterval(() => {
      if (this.queue.length > 0 && !this.processing) {
        this.processQueue();
      }
    }, 100);
  }
  
  getStats() {
    return {
      queueLength: this.queue.length,
      queryCount: this.queryCount,
      tokens: Math.floor(this.tokens),
      windowRemaining: Math.max(0, 60000 - (Date.now() - this.windowStart))
    };
  }
}

module.exports = RateLimiter;